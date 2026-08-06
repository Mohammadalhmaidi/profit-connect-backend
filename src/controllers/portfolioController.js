const PortfolioItem = require('../models/PortfolioItem');
const PortfolioCollection = require('../models/PortfolioCollection');
const User = require('../models/User');
const RScoreService = require('../services/rScoreService');
const { evaluateContent } = require('../services/aiEvaluationService');
const { applyWarning } = require('../services/moderationService');
const { buildPortfolioMediaUrl, deletePortfolioMedia } = require('../utils/portfolioStorage');
const { sanitizePostContent } = require('../utils/sanitizeContent');

const isValidId = (id) => /^[0-9a-fA-F]{24}$/.test(id);

// تحويل حقل JSON يأتي كسلسلة نصية (من FormData) إلى مصفوفة
const parseJsonField = (value, fallback) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch (e) {
      return fallback;
    }
  }
  return fallback;
};

// ============================================================
// أعمال المعرض (Portfolio Items)
// ============================================================

// @desc    إنشاء عمل جديد في المعرض
// @route   POST /api/portfolio/items
// @access  Private
exports.createItem = async (req, res) => {
  try {
    const { title, category, description, tags, skills, client, duration, role, projectUrl, visibility, coverImage, linkedProject } = req.body;

    if (!title || !category) {
      return res.status(400).json({ success: false, message: 'عنوان العمل والتصنيف مطلوبان' });
    }

    const uploaded = req.files || [];
    if (uploaded.length === 0) {
      return res.status(400).json({ success: false, message: 'يجب رفع صورة أو فيديو واحد على الأقل للعمل' });
    }

    // بناء قائمة الوسائط من الملفات المرفوعة
    const media = uploaded.map((file, index) => ({
      url: buildPortfolioMediaUrl(req, file.filename),
      type: file.mimetype.startsWith('video/') ? 'video' : 'image',
      order: index,
    }));

    // صورة الغلاف: أول صورة مرفوعة أو معرف صريح
    let selectedCover = coverImage || null;
    if (!selectedCover) {
      const firstImage = media.find((m) => m.type === 'image');
      if (firstImage) selectedCover = firstImage.url;
    }

    const sanitizedDescription = description ? sanitizePostContent(description) : '';

    const newItem = await PortfolioItem.create({
      user: req.user._id,
      title: sanitizePostContent(title),
      category,
      description: sanitizedDescription,
      tags: parseJsonField(tags, []),
      skills: parseJsonField(skills, []),
      client: client || '',
      duration: duration || '',
      role: role || '',
      projectUrl: projectUrl || '',
      visibility: visibility || 'public',
      coverImage: selectedCover,
      linkedProject: linkedProject && isValidId(linkedProject) ? linkedProject : null,
      media,
    });

    // زيادة عداد أعمال المعرض للمستخدم
    await User.findByIdAndUpdate(req.user._id, { $inc: { 'profile.portfolioCount': 1 } });

    // 🤖 تقييم الوصف بالذكاء في الخلفية
    if (description) {
      setImmediate(async () => {
        try {
          const score = await evaluateContent(description);
          if (score === -1) {
            await applyWarning(req.user._id, description, 'وصف عمل غير لائق في المعرض');
          } else if (score > 0) {
            await RScoreService.applyScore(req.user._id, 'ADD_PORTFOLIO_ITEM', `عمل معرض جديد: ${score} نقاط`, score);
          }
        } catch (e) {
          console.error('[Portfolio AI Error]:', e.message);
        }
      });
    }

    const populated = await PortfolioItem.findById(newItem._id).populate('user', 'profile.firstName profile.lastName profile.avatar profile.headline');
    res.status(201).json({ success: true, message: 'تمت إضافة العمل إلى معرضك', data: populated });
  } catch (error) {
    console.error('Create Portfolio Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء إضافة العمل' });
  }
};

// @desc    أعمالي (لصاحب الحساب)
// @route   GET /api/portfolio/items
// @access  Private
exports.getMyItems = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    const filter = { user: req.user._id };
    if (req.query.category) filter.category = req.query.category;
    if (req.query.tag) filter.tags = req.query.tag;
    if (req.query.featured === 'true') filter.isFeatured = true;

    const [items, total] = await Promise.all([
      PortfolioItem.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('linkedProject', 'title status category')
        .lean(),
      PortfolioItem.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      count: items.length,
      data: items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب أعمالك' });
  }
};

// @desc    أعمال مستخدم معين (المعرض العام)
// @route   GET /api/portfolio/users/:userId/items
// @access  Private
exports.getUserItems = async (req, res) => {
  try {
    if (!isValidId(req.params.userId)) {
      return res.status(400).json({ success: false, message: 'معرّف المستخدم غير صالح' });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    const isOwner = req.user._id.toString() === req.params.userId;
    const filter = { user: req.params.userId };
    if (!isOwner) filter.visibility = 'public';
    if (req.query.category) filter.category = req.query.category;

    const [items, total] = await Promise.all([
      PortfolioItem.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('user', 'profile.firstName profile.lastName profile.avatar profile.headline username')
        .populate('linkedProject', 'title status category')
        .lean(),
      PortfolioItem.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      count: items.length,
      data: items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب المعرض' });
  }
};

// @desc    عرض عمل محدد (يُزيد عدد المشاهدات)
// @route   GET /api/portfolio/items/:id
// @access  Private
exports.getItemById = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'معرّف العمل غير صالح' });
    }

    const item = await PortfolioItem.findById(req.params.id)
      .populate('user', 'profile.firstName profile.lastName profile.avatar profile.headline username')
      .populate('linkedProject', 'title status category')
      .lean();

    if (!item) {
      return res.status(404).json({ success: false, message: 'العمل غير موجود' });
    }

    // العمل الخاص لا يظهر إلا لصاحبه
    if (item.visibility === 'private' && item.user._id.toString() !== req.user._id.toString()) {
      return res.status(404).json({ success: false, message: 'العمل غير موجود' });
    }

    // تسجيل مشاهدة (لا تُحسب على صاحب العمل نفسه)
    if (item.user._id.toString() !== req.user._id.toString()) {
      await PortfolioItem.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });
      item.views = (item.views || 0) + 1;
    }

    res.status(200).json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب العمل' });
  }
};

// @desc    تعديل عمل
// @route   PUT /api/portfolio/items/:id
// @access  Private (المالك فقط)
exports.updateItem = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'معرّف العمل غير صالح' });
    }

    const item = await PortfolioItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'العمل غير موجود' });
    }
    if (item.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'غير مصرح لك بتعديل هذا العمل' });
    }

    const uploaded = req.files || [];

    // حذف الوسائط المطلوب إزالتها من التخزين
    const toRemove = parseJsonField(req.body.removeMedia, []);
    for (const url of toRemove) {
      await deletePortfolioMedia(url);
    }

    // هل أرسل العميل وسائط صراحة أو رفع ملفات جديدة؟
    const hasMediaPayload = req.body.media !== undefined && req.body.media !== '';
    const newMedia = uploaded.map((file, index) => ({
      url: buildPortfolioMediaUrl(req, file.filename),
      type: file.mimetype.startsWith('video/') ? 'video' : 'image',
      order: index,
    }));

    let media;
    let mediaChanged = false;
    if (hasMediaPayload || uploaded.length > 0) {
      // الوسائط الحالية المرسلة (إن وُجدت) أو وسائط العمل الحالية كأساس
      const baseMedia = hasMediaPayload
        ? parseJsonField(req.body.media, [])
        : item.media.map((m) => ({ url: m.url, type: m.type, order: m.order }));
      const keptMedia = baseMedia
        .filter((m) => !toRemove.includes(typeof m === 'string' ? m : m.url))
        .map((m, i) => ({
          url: typeof m === 'string' ? m : m.url,
          type: typeof m === 'string' ? 'image' : m.type || 'image',
          order: m.order !== undefined ? m.order : i,
        }));
      media = [...keptMedia, ...newMedia.map((m) => ({ ...m, order: keptMedia.length + m.order }))];
      mediaChanged = true;
    }

    const updateData = {};
    if (req.body.title) updateData.title = sanitizePostContent(req.body.title);
    if (req.body.category) updateData.category = req.body.category;
    if (req.body.description !== undefined) updateData.description = sanitizePostContent(req.body.description);
    if (req.body.tags !== undefined) updateData.tags = parseJsonField(req.body.tags, item.tags);
    if (req.body.skills !== undefined) updateData.skills = parseJsonField(req.body.skills, item.skills);
    if (req.body.client !== undefined) updateData.client = req.body.client;
    if (req.body.duration !== undefined) updateData.duration = req.body.duration;
    if (req.body.role !== undefined) updateData.role = req.body.role;
    if (req.body.projectUrl !== undefined) updateData.projectUrl = req.body.projectUrl;
    if (req.body.visibility !== undefined) updateData.visibility = req.body.visibility;
    if (req.body.isFeatured !== undefined) updateData.isFeatured = req.body.isFeatured === 'true' || req.body.isFeatured === true;
    if (req.body.linkedProject !== undefined) updateData.linkedProject = req.body.linkedProject && isValidId(req.body.linkedProject) ? req.body.linkedProject : null;

    // صورة الغلاف: معرف صريح، أو أول صورة من الوسائط النهائية، أو إبقاء الحالية
    if (req.body.coverImage !== undefined) {
      updateData.coverImage = req.body.coverImage || null;
    } else if (mediaChanged) {
      const firstImage = media.find((m) => m.type === 'image') || media[0] || null;
      updateData.coverImage = firstImage ? firstImage.url : null;
    }

    if (mediaChanged) {
      updateData.media = media;
    }

    const updated = await PortfolioItem.findByIdAndUpdate(req.params.id, { $set: updateData }, { new: true, runValidators: true })
      .populate('linkedProject', 'title status category');

    res.status(200).json({ success: true, message: 'تم تعديل العمل بنجاح', data: updated });
  } catch (error) {
    console.error('Update Portfolio Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تعديل العمل' });
  }
};

// @desc    حذف عمل
// @route   DELETE /api/portfolio/items/:id
// @access  Private (المالك فقط)
exports.deleteItem = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'معرّف العمل غير صالح' });
    }

    const item = await PortfolioItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'العمل غير موجود' });
    }
    if (item.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'غير مصرح لك بحذف هذا العمل' });
    }

    // حذف ملفات الوسائط من التخزين
    for (const m of item.media) {
      await deletePortfolioMedia(m.url);
    }

    // إزالة العمل من جميع المجموعات
    await PortfolioCollection.updateMany(
      { user: req.user._id },
      { $pull: { items: item._id } }
    );

    await User.findByIdAndUpdate(req.user._id, { $inc: { 'profile.portfolioCount': -1 } });
    await item.deleteOne();

    res.status(200).json({ success: true, message: 'تم حذف العمل بنجاح' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء حذف العمل' });
  }
};

// @desc    إعجاب / إلغاء إعجاب بعمل
// @route   POST /api/portfolio/items/:id/like
// @access  Private
exports.toggleLike = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'معرّف العمل غير صالح' });
    }

    const item = await PortfolioItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'العمل غير موجود' });
    }

    const index = item.likes.indexOf(req.user._id);
    let isLiked = false;

    if (index === -1) {
      item.likes.push(req.user._id);
      isLiked = true;

      // مكافأة صاحب العمل عند استلام إعجاب (منع الإعجاب الذاتي)
      if (item.user.toString() !== req.user._id.toString()) {
        await RScoreService.applyScore(item.user.toString(), 'RECEIVE_PORTFOLIO_LIKE', 'حصلت على إعجاب جديد على عمل في معرضك');
      }
    } else {
      item.likes.splice(index, 1);
    }

    await item.save();
    res.status(200).json({ success: true, isLiked, likesCount: item.likes.length });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء معالجة الإعجاب' });
  }
};

// ============================================================
// مجموعات المعرض (Collections)
// ============================================================

// @desc    إنشاء مجموعة
// @route   POST /api/portfolio/collections
// @access  Private
exports.createCollection = async (req, res) => {
  try {
    const { name, description, isPublic } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'اسم المجموعة مطلوب' });
    }

    const collection = await PortfolioCollection.create({
      user: req.user._id,
      name,
      description: description || '',
      isPublic: isPublic !== 'false' && isPublic !== false,
    });

    res.status(201).json({ success: true, message: 'تم إنشاء المجموعة', data: collection });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء إنشاء المجموعة' });
  }
};

// @desc    مجموعاتي
// @route   GET /api/portfolio/collections
// @access  Private
exports.getMyCollections = async (req, res) => {
  try {
    const collections = await PortfolioCollection.find({ user: req.user._id })
      .populate('items', 'title coverImage category visibility')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: collections.length, data: collections });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب المجموعات' });
  }
};

// @desc    مجموعات مستخدم معين (العامة فقط ما لم يكن المالك)
// @route   GET /api/portfolio/users/:userId/collections
// @access  Private
exports.getUserCollections = async (req, res) => {
  try {
    if (!isValidId(req.params.userId)) {
      return res.status(400).json({ success: false, message: 'معرّف المستخدم غير صالح' });
    }

    const isOwner = req.user._id.toString() === req.params.userId;
    const filter = { user: req.params.userId };
    if (!isOwner) filter.isPublic = true;

    const collections = await PortfolioCollection.find(filter)
      .populate('items', 'title coverImage category visibility')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: collections.length, data: collections });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب المجموعات' });
  }
};

// @desc    مجموعة محددة
// @route   GET /api/portfolio/collections/:id
// @access  Private
exports.getCollectionById = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'معرّف المجموعة غير صالح' });
    }

    const collection = await PortfolioCollection.findById(req.params.id)
      .populate('user', 'profile.firstName profile.lastName profile.avatar username')
      .populate('items')
      .lean();

    if (!collection) {
      return res.status(404).json({ success: false, message: 'المجموعة غير موجودة' });
    }

    if (!collection.isPublic && collection.user._id.toString() !== req.user._id.toString()) {
      return res.status(404).json({ success: false, message: 'المجموعة غير موجودة' });
    }

    res.status(200).json({ success: true, data: collection });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب المجموعة' });
  }
};

// @desc    تعديل مجموعة
// @route   PUT /api/portfolio/collections/:id
// @access  Private (المالك فقط)
exports.updateCollection = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'معرّف المجموعة غير صالح' });
    }

    const collection = await PortfolioCollection.findById(req.params.id);
    if (!collection) {
      return res.status(404).json({ success: false, message: 'المجموعة غير موجودة' });
    }
    if (collection.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'غير مصرح لك بتعديل هذه المجموعة' });
    }

    const updateData = {};
    if (req.body.name !== undefined) updateData.name = req.body.name;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.isPublic !== undefined) updateData.isPublic = req.body.isPublic === 'true' || req.body.isPublic === true;

    const updated = await PortfolioCollection.findByIdAndUpdate(req.params.id, { $set: updateData }, { new: true, runValidators: true })
      .populate('items', 'title coverImage category visibility');
    res.status(200).json({ success: true, message: 'تم تعديل المجموعة', data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تعديل المجموعة' });
  }
};

// @desc    حذف مجموعة
// @route   DELETE /api/portfolio/collections/:id
// @access  Private (المالك فقط)
exports.deleteCollection = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'معرّف المجموعة غير صالح' });
    }

    const collection = await PortfolioCollection.findById(req.params.id);
    if (!collection) {
      return res.status(404).json({ success: false, message: 'المجموعة غير موجودة' });
    }
    if (collection.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'غير مصرح لك بحذف هذه المجموعة' });
    }

    await collection.deleteOne();
    res.status(200).json({ success: true, message: 'تم حذف المجموعة' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء حذف المجموعة' });
  }
};

// @desc    إضافة عمل إلى مجموعة
// @route   POST /api/portfolio/collections/:id/items/:itemId
// @access  Private (المالك فقط)
exports.addItemToCollection = async (req, res) => {
  try {
    if (!isValidId(req.params.id) || !isValidId(req.params.itemId)) {
      return res.status(400).json({ success: false, message: 'معرّف غير صالح' });
    }

    const collection = await PortfolioCollection.findById(req.params.id);
    if (!collection) {
      return res.status(404).json({ success: false, message: 'المجموعة غير موجودة' });
    }
    if (collection.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'غير مصرح لك' });
    }

    const item = await PortfolioItem.findOne({ _id: req.params.itemId, user: req.user._id });
    if (!item) {
      return res.status(404).json({ success: false, message: 'العمل غير موجود أو ليس ملكك' });
    }

    if (!collection.items.includes(item._id)) {
      collection.items.push(item._id);
      await collection.save();
    }

    res.status(200).json({ success: true, message: 'تمت إضافة العمل إلى المجموعة' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء إضافة العمل للمجموعة' });
  }
};

// @desc    إزالة عمل من مجموعة
// @route   DELETE /api/portfolio/collections/:id/items/:itemId
// @access  Private (المالك فقط)
exports.removeItemFromCollection = async (req, res) => {
  try {
    if (!isValidId(req.params.id) || !isValidId(req.params.itemId)) {
      return res.status(400).json({ success: false, message: 'معرّف غير صالح' });
    }

    const collection = await PortfolioCollection.findByIdAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { $pull: { items: req.params.itemId } },
      { new: true }
    );

    if (!collection) {
      return res.status(404).json({ success: false, message: 'المجموعة غير موجودة' });
    }

    res.status(200).json({ success: true, message: 'تمت إزالة العمل من المجموعة' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء إزالة العمل من المجموعة' });
  }
};
