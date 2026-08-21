const Company = require('../models/Company');
const User = require('../models/User');
const Post = require('../models/Post');
const { escapeRegex } = require('../utils/regex');

// أداة للتحقق من صحة معرّف ObjectId
const isValidId = (id) => /^[0-9a-fA-F]{24}$/.test(id);

// ============================================================
// الإحصائيات العامة
// ============================================================

// @desc    ملخص إحصائي للوحة التحكم
// @route   GET /api/admin/stats
// @access  Private/Admin
exports.getStats = async (req, res) => {
  try {
    const [usersCount, companiesCount, postsCount, pendingCompanies, byRole, byCompanyStatus, byPostAi] = await Promise.all([
      User.countDocuments(),
      Company.countDocuments(),
      Post.countDocuments(),
      Company.countDocuments({ status: 'Pending' }),
      User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
      Company.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Post.aggregate([{ $group: { _id: { $cond: [{ $gte: ['$aiProbability', 50] }, 'suspected_ai', 'clean'] }, count: { $sum: 1 } } }]),
    ]);

    res.status(200).json({
      success: true,
      data: {
        users: usersCount,
        companies: companiesCount,
        posts: postsCount,
        pendingCompanies,
        usersByRole: byRole,
        companiesByStatus: byCompanyStatus,
        postsByAi: byPostAi,
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب الإحصائيات' });
  }
};

// ============================================================
// إدارة المستخدمين
// ============================================================

// @desc    قائمة المستخدمين مع فلترة وصفحات
// @route   GET /api/admin/users
// @access  Private/Admin
exports.getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.search) {
      const search = escapeRegex(req.query.search);
      filter.$or = [
        { email: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
        { 'profile.firstName': { $regex: search, $options: 'i' } },
        { 'profile.lastName': { $regex: search, $options: 'i' } },
      ];
    }

    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments(filter);

    res.status(200).json({
      success: true,
      count: users.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: users
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب المستخدمين' });
  }
};

// @desc    بيانات مستخدم كاملة للإدارة
// @route   GET /api/admin/users/:id
// @access  Private/Admin
exports.getUserById = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'معرّف المستخدم غير صالح' });
    }

    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    }

    const companiesCount = await Company.countDocuments({ owner: user._id });
    const postsCount = await Post.countDocuments({ user: user._id });

    res.status(200).json({
      success: true,
      data: { ...user.toObject(), companiesCount, postsCount }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب بيانات المستخدم' });
  }
};

// @desc    تغيير حالة المستخدم (تفعيل/حظر)
// @route   PUT /api/admin/users/:id/status
// @access  Private/Admin
exports.updateUserStatus = async (req, res) => {
  try {
    const { status, bannedUntil } = req.body;

    if (!['active', 'banned'].includes(status)) {
      return res.status(400).json({ success: false, message: 'الحالة يجب أن تكون active أو banned' });
    }

    if (!isValidId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'معرّف المستخدم غير صالح' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    }

    user.status = status;
    user.isActive = status === 'active';
    user.bannedUntil = status === 'banned' ? (bannedUntil ? new Date(bannedUntil) : null) : null;

    await user.save();

    res.status(200).json({
      success: true,
      message: `تم تعيين حالة المستخدم إلى ${status}`,
      data: { id: user._id, status: user.status, isActive: user.isActive, bannedUntil: user.bannedUntil }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تحديث حالة المستخدم' });
  }
};

// @desc    حذف مستخدم ومنشوراته
// @route   DELETE /api/admin/users/:id
// @access  Private/Admin
exports.deleteUser = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'معرّف المستخدم غير صالح' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    }

    await Post.deleteMany({ user: user._id });
    await user.deleteOne();

    res.status(200).json({ success: true, message: 'تم حذف المستخدم ومنشوراته' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء حذف المستخدم' });
  }
};

// @desc    منح/تعديل دور مستخدم
// @route   PUT /api/admin/users/:id/role
// @access  Private/Admin
exports.setUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    const allowedRoles = ['Employer', 'JobSeeker', 'Admin', 'FreelanceClient'];

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ success: false, message: 'الدور غير صالح' });
    }

    if (!isValidId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'معرّف المستخدم غير صالح' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    }

    user.role = role;
    await user.save();

    res.status(200).json({
      success: true,
      message: `تم تعيين دور المستخدم إلى ${role}`,
      data: { id: user._id, role: user.role }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تحديث دور المستخدم' });
  }
};

// ============================================================
// إدارة الشركات
// ============================================================

// @desc    جميع الشركات مع فلترة
// @route   GET /api/admin/companies
// @access  Private/Admin
exports.getCompanies = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.search) filter.name = { $regex: escapeRegex(req.query.search), $options: 'i' };

    const companies = await Company.find(filter)
      .populate('owner', 'profile.firstName profile.lastName email username')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: companies.length, data: companies });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب الشركات' });
  }
};

// @desc    جلب جميع الشركات المعلقة التي تنتظر الموافقة
// @route   GET /api/admin/companies/pending
// @access  Private/Admin
exports.getPendingCompanies = async (req, res) => {
  try {
    const companies = await Company.find({ status: 'Pending' })
      .populate('owner', 'profile.firstName profile.lastName email');

    res.status(200).json({ success: true, count: companies.length, data: companies });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب الشركات المعلقة' });
  }
};

// @desc    بيانات شركة كاملة للإدارة
// @route   GET /api/admin/companies/:id
// @access  Private/Admin
exports.getCompanyById = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'معرّف الشركة غير صالح' });
    }

    const company = await Company.findById(req.params.id)
      .populate('owner', 'profile.firstName profile.lastName email username')
      .populate('admins', 'profile.firstName profile.lastName email username')
      .populate('followers', 'profile.firstName profile.lastName email username')
      .populate('ratings.user', 'profile.firstName profile.lastName email username');

    if (!company) {
      return res.status(404).json({ success: false, message: 'الشركة غير موجودة' });
    }

    res.status(200).json({ success: true, data: company });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب بيانات الشركة' });
  }
};

// @desc    الموافقة على شركة أو رفضها + إشعار صاحب الشركة
// @route   PUT /api/admin/companies/:id/status
// @access  Private/Admin
exports.updateCompanyStatus = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body; // يتوقع أن نرسل 'Approved' أو 'Rejected'

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'الحالة يجب أن تكون Approved أو Rejected' });
    }

    if (!isValidId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'معرّف الشركة غير صالح' });
    }

    const company = await Company.findById(req.params.id);

    if (!company) {
      return res.status(404).json({ success: false, message: 'الشركة غير موجودة' });
    }

    company.status = status;

    // إذا تمت الموافقة، نجعل الشركة موثقة أيضاً
    if (status === 'Approved') {
      company.isVerified = true;
      company.rejectionReason = '';
    } else {
      // عند الرفض نسجّل سبب الرفض إن وُجد
      company.isVerified = false;
      company.rejectionReason = rejectionReason || '';
    }

    await company.save();

    // إشعار لصاحب الشركة بحالة طلبه
    const message = status === 'Approved'
      ? 'مبروك! تم اعتماد شركتك وصرت قادراً على إدارتها ونشر وظائفك.'
      : `تم رفض طلب إنشاء شركتك.${company.rejectionReason ? ' السبب: ' + company.rejectionReason : ''}`;

    await User.findByIdAndUpdate(company.owner, {
      $push: {
        notifications: {
          type: 'company_status',
          message,
          companyId: company._id,
          read: false
        }
      }
    });

    res.status(200).json({ success: true, message: `تم تغيير حالة الشركة إلى ${status}`, data: company });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تحديث حالة الشركة' });
  }
};

// @desc    حذف شركة
// @route   DELETE /api/admin/companies/:id
// @access  Private/Admin
exports.deleteCompany = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'معرّف الشركة غير صالح' });
    }

    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ success: false, message: 'الشركة غير موجودة' });
    }

    await company.deleteOne();

    res.status(200).json({ success: true, message: 'تم حذف الشركة' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء حذف الشركة' });
  }
};

// ============================================================
// الإشراف على المحتوى (المنشورات)
// ============================================================

// @desc    قائمة المنشورات للإشراف مع فلترة
// @route   GET /api/admin/posts
// @access  Private/Admin
exports.getPosts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.minAi) filter.aiProbability = { $gte: parseInt(req.query.minAi) };
    if (req.query.userId) filter.user = req.query.userId;

    const posts = await Post.find(filter)
      .populate('user', 'profile.firstName profile.lastName email username')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Post.countDocuments(filter);

    res.status(200).json({
      success: true,
      count: posts.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: posts
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب المنشورات' });
  }
};

// @desc    حذف منشور (إشراف)
// @route   DELETE /api/admin/posts/:id
// @access  Private/Admin
exports.deletePost = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'معرّف المنشور غير صالح' });
    }

    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, message: 'المنشور غير موجود' });
    }

    await post.deleteOne();

    res.status(200).json({ success: true, message: 'تم حذف المنشور' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء حذف المنشور' });
  }
};
