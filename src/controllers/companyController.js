const Company = require('../models/Company');
const Job = require('../models/Job');
const { buildCompanyDocUrl } = require('../utils/companyStorage');
const { buildCompanyMediaUrl, deleteCompanyMediaFile } = require('../utils/companyMedia');

// @desc    إنشاء صفحة شركة جديدة
// @route   POST /api/companies
// @access  Private
// @desc    إنشاء صفحة شركة جديدة
// @route   POST /api/companies
// @access  Private
exports.createCompany = async (req, res) => {
  try {
    // 🔒 بوابة الدور: فقط صاحب عمل (Employer) يمكنه إنشاء شركة
    if (req.user.role !== 'Employer') {
      return res.status(403).json({
        success: false,
        message: 'غير مصرح لك! إنشاء الشركات مقتصر على أصحاب العمل المعتمدين'
      });
    }

    // 1. جلب جميع الحقول الجديدة من الطلب (مع الرجوع لملف صاحب العمل إن غابت)
    const ep = req.user.employerProfile || {};
    const { 
      name, 
      description, 
      industry, 
      location, 
      companySize, 
      foundedYear,
      website, 
      socialLinks,
      contactEmail
    } = req.body;

    const companyName = name || ep.companyName;
    const companyDescription = description || ep.companyDescription;
    const companyIndustry = industry || ep.industry;
    const companyWebsite = website || ep.website;
    const companySizeVal = companySize || ep.companySize;
    const companyFounded = foundedYear || ep.foundedYear;

    if (!companyName) {
      return res.status(400).json({ success: false, message: 'اسم الشركة مطلوب' });
    }

    // بناء كائن الموقع الجديد
    // عند استخدام multipart/form-data (لرفع الملفات) يصل location كنص JSON
    let parsedLocation = location;
    if (typeof location === 'string') {
      try {
        parsedLocation = JSON.parse(location);
      } catch (e) {
        parsedLocation = null;
      }
    }

    let companyLocation;
    if (parsedLocation && typeof parsedLocation === 'object') {
      companyLocation = {
        country: parsedLocation.country || ep.companyLocation?.country || '',
        city: parsedLocation.city || ep.companyLocation?.city || '',
        street: parsedLocation.street || ep.companyLocation?.street || '',
        buildingNumber: parsedLocation.buildingNumber || ep.companyLocation?.buildingNumber || '',
        coordinates: {
          type: 'Point',
          coordinates: [
            Number(parsedLocation.coordinates?.x) || Number(parsedLocation.coordinates?.coordinates?.[0]) || 0,
            Number(parsedLocation.coordinates?.y) || Number(parsedLocation.coordinates?.coordinates?.[1]) || 0
          ]
        }
      };
    } else if (ep.companyLocation && typeof ep.companyLocation === 'object') {
      companyLocation = ep.companyLocation;
    } else {
      companyLocation = { country: '', city: '', street: '', buildingNumber: '', coordinates: { type: 'Point', coordinates: [0, 0] } };
    }

    if (!companyLocation.country) {
      return res.status(400).json({ success: false, message: 'الدولة مطلوبة' });
    }
    if (!companyLocation.city) {
      return res.status(400).json({ success: false, message: 'المدينة مطلوبة' });
    }

    // 2. حفظ مسارات مستندات التحقق المرفوعة (سجل تجاري، رخصة، ...)
    const verificationDocs = (req.files || []).map(f => buildCompanyDocUrl(req, f.filename));

    // 3. إنشاء الشركة (تبقى Pending حتى يوافق عليها الإداري)
    const company = await Company.create({
      name: companyName,
      description: companyDescription,
      industry: companyIndustry,
      location: companyLocation,
      companySize: companySizeVal,
      foundedYear: companyFounded,
      website: companyWebsite,
      socialLinks,
      contactEmail,
      verificationDocs,
      owner: req.user._id,
      admins: [req.user._id],
      status: 'Pending'
    });

    res.status(201).json({
      success: true,
      message: 'تم إرسال طلب إنشاء الشركة، وهي قيد المراجعة من فريق الدعم',
      data: company
    });
  } catch (error) {
    console.error('Create Company Error:', error.message);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'اسم الشركة مستخدم بالفعل' });
    }
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء إنشاء الشركة' });
  }
};
// @desc    جلب جميع الشركات (مع Pagination و Filtering)
// @route   GET /api/companies
// @access  Private
exports.getCompanies = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = {};

    // افتراضياً لا تظهر في الدليل العام إلا الشركات المعتمدة (Approved)
    // يستطيع الإداري تجاوز ذلك بتمرير ?status=Pending
    if (req.query.status) {
      filter.status = req.query.status;
    } else {
      filter.status = 'Approved';
    }

    if (req.query.industry) {
      filter.industry = { $regex: req.query.industry, $options: 'i' };
    }
    if (req.query.search) {
      filter.name = { $regex: req.query.search, $options: 'i' };
    }

    let sortOption = { createdAt: -1 };
    if (req.query.sort === 'top') {
      sortOption = { averageRating: -1, 'ratings': -1 };
      filter['ratings.1'] = { $exists: true };
    } else if (req.query.sort === 'popular') {
      sortOption = { followersCount: -1 };
    }

    const companies = await Company.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .populate('owner', 'profile.firstName profile.lastName profile.avatar');

    const total = await Company.countDocuments(filter);

    res.status(200).json({
      success: true,
      count: companies.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: companies
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب الشركات' });
  }
};

// @desc    جلب شركة محددة بالـ ID
// @route   GET /api/companies/:id
// @access  Private
exports.getCompanyById = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id)
      .populate('owner', 'profile.firstName profile.lastName profile.avatar profile.headline')
      .populate('admins', 'profile.firstName profile.lastName profile.avatar')
      .populate('followers.user', 'profile.firstName profile.lastName profile.avatar profile.headline')
      .populate('ratings.user', 'profile.firstName profile.lastName profile.avatar profile.headline');

    if (!company) {
      return res.status(404).json({ success: false, message: 'الشركة غير موجودة' });
    }

    const jobsCount = await Job.countDocuments({ company: company._id });
    const recentJobs = await Job.find({ company: company._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('title location type workLevel workPlace salary createdAt status');

    const responseData = company.toObject();
    responseData.jobsCount = jobsCount;
    responseData.recentJobs = recentJobs;

    res.status(200).json({ success: true, data: responseData });
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ success: false, message: 'الشركة غير موجودة' });
    }
    res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
  }
};

// لا تنسَ استدعاء نموذج المستخدم في أعلى الملف إذا لم يكن موجوداً:
// const User = require('../models/User');

// @desc    متابعة / إلغاء متابعة شركة (Toggle Follow)
// @route   POST /api/companies/:id/follow
// @access  Private
exports.toggleFollowCompany = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);

    if (!company) {
      return res.status(404).json({ success: false, message: 'الشركة غير موجودة' });
    }

    // التحقق مما إذا كان المستخدم يتابع الشركة بالفعل
    const followerIndex = company.followers.findIndex(
      f => f.user.toString() === req.user._id.toString()
    );
    let isFollowing = false;

    if (followerIndex === -1) {
      // إذا لم يكن يتابعها، نقوم بإضافته
      company.followers.push({ user: req.user._id, followedAt: new Date() });
      company.followersCount += 1;
      isFollowing = true;
    } else {
      // إذا كان يتابعها مسبقاً، نقوم بإلغاء المتابعة
      company.followers.splice(followerIndex, 1);
      company.followersCount -= 1;
    }

    await company.save();

    res.status(200).json({
      success: true,
      isFollowing,
      followersCount: company.followersCount
    });
  } catch (error) {
    console.error('Follow Company Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء معالجة المتابعة' });
  }
};

// @desc    إضافة مدير جديد للشركة
// @route   POST /api/companies/:id/admins
// @access  Private
exports.addCompanyAdmin = async (req, res) => {
  try {
    const { newAdminId } = req.body; // الـ ID الخاص بالمستخدم الذي نريد ترقيته لمدير

    const company = await Company.findById(req.params.id);

    if (!company) {
      return res.status(404).json({ success: false, message: 'الشركة غير موجودة' });
    }

    // 🔒 حماية أمنية: فقط "مالك" الشركة يمكنه إضافة مدراء آخرين
    if (company.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'غير مصرح لك! المالك فقط يمكنه إضافة مدراء' });
    }

    // التأكد من أن المستخدم المطلوب إضافته موجود في قاعدة البيانات
    const User = require('../models/User'); // استدعاء الموديل
    const newAdmin = await User.findById(newAdminId);
    
    if (!newAdmin) {
      return res.status(404).json({ success: false, message: 'المستخدم المطلوب إضافته غير موجود' });
    }

    // التأكد من أنه ليس مديراً بالفعل لتجنب التكرار
    if (company.admins.includes(newAdminId)) {
      return res.status(400).json({ success: false, message: 'هذا المستخدم هو مدير بالفعل في هذه الشركة' });
    }

    // إضافته لمصفوفة المدراء
    company.admins.push(newAdminId);
    await company.save();

    res.status(200).json({
      success: true,
      message: 'تمت إضافة المدير بنجاح',
      adminsCount: company.admins.length
    });
  } catch (error) {
    console.error('Add Admin Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء إضافة المدير' });
  }
};

// @desc    تحديث بيانات الشركة
// @route   PUT /api/companies/:id
// @access  Private (owner or admin)
exports.updateCompany = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ success: false, message: 'الشركة غير موجودة' });
    }

    const isOwner = company.owner.toString() === req.user._id.toString();
    const isAdmin = company.admins.some(a => a.toString() === req.user._id.toString());
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'غير مصرح لك بتعديل هذه الشركة' });
    }

    const allowed = ['name', 'description', 'industry', 'companySize', 'foundedYear', 'website', 'socialLinks', 'contactEmail'];
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        company[field] = req.body[field];
      }
    }

    // معالجة رفع صورة الشعار (Logo)
    if (req.files && req.files.logo && req.files.logo[0]) {
      // حذف الصورة القديمة إذا كانت محلية
      if (company.logo && company.logo !== 'default-company-logo.png') {
        await deleteCompanyMediaFile(company.logo);
      }
      company.logo = buildCompanyMediaUrl(req, req.files.logo[0].filename);
    } else if (req.body.logo !== undefined) {
      // السماح بتمرير رابط URL كنص
      company.logo = req.body.logo;
    }

    // معالجة رفع صورة الغلاف (Cover Photo)
    if (req.files && req.files.coverPhoto && req.files.coverPhoto[0]) {
      // حذف الصورة القديمة إذا كانت محلية
      if (company.coverPhoto && company.coverPhoto !== 'default-company-cover.png') {
        await deleteCompanyMediaFile(company.coverPhoto);
      }
      company.coverPhoto = buildCompanyMediaUrl(req, req.files.coverPhoto[0].filename);
    } else if (req.body.coverPhoto !== undefined) {
      // السماح بتمرير رابط URL كنص
      company.coverPhoto = req.body.coverPhoto;
    }

    // معالجة الموقع بشكل خاص لأنه كائن متداخل
    // عند استخدام multipart/form-data يصل location كنص JSON
    let loc = req.body.location;
    if (typeof loc === 'string') {
      try {
        loc = JSON.parse(loc);
      } catch (e) {
        loc = null;
      }
    }
    if (loc && typeof loc === 'object') {
      if (!company.location) {
        company.location = {};
      }
      if (loc.country !== undefined) company.location.country = loc.country;
      if (loc.city !== undefined) company.location.city = loc.city;
      if (loc.street !== undefined) company.location.street = loc.street;
      if (loc.buildingNumber !== undefined) company.location.buildingNumber = loc.buildingNumber;
      if (loc.coordinates) {
        if (!company.location.coordinates) {
          company.location.coordinates = { type: 'Point', coordinates: [0, 0] };
        }
        if (loc.coordinates.x !== undefined || loc.coordinates.coordinates?.[0] !== undefined) {
          company.location.coordinates.coordinates[0] = Number(loc.coordinates.x) || Number(loc.coordinates.coordinates?.[0]) || 0;
        }
        if (loc.coordinates.y !== undefined || loc.coordinates.coordinates?.[1] !== undefined) {
          company.location.coordinates.coordinates[1] = Number(loc.coordinates.y) || Number(loc.coordinates.coordinates?.[1]) || 0;
        }
      }
    }

    await company.save();
    res.status(200).json({ success: true, data: company });
  } catch (error) {
    console.error('Update Company Error:', error.message);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'اسم الشركة مستخدم بالفعل' });
    }
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تحديث الشركة' });
  }
};

// @desc    حذف شركة
// @route   DELETE /api/companies/:id
// @access  Private (owner only)
exports.deleteCompany = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ success: false, message: 'الشركة غير موجودة' });
    }

    if (company.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'غير مصرح لك! المالك فقط يمكنه حذف الشركة' });
    }

    await company.deleteOne();
    res.status(200).json({ success: true, message: 'تم حذف الشركة بنجاح' });
  } catch (error) {
    console.error('Delete Company Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء حذف الشركة' });
  }
};

// @desc    تغيير حالة الشركة (Pending → Approved / Rejected)
// @route   PATCH /api/companies/:id/status
// @access  Private (owner or admin)
exports.updateCompanyStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['Pending', 'Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'حالة غير صالحة. الحالات المسموحة: Pending, Approved, Rejected' });
    }

    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ success: false, message: 'الشركة غير موجودة' });
    }

    const isOwner = company.owner.toString() === req.user._id.toString();
    const isAdmin = company.admins.some(a => a.toString() === req.user._id.toString());
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'غير مصرح لك بتغيير حالة الشركة' });
    }

    company.status = status;
    if (status === 'Approved') {
      company.isVerified = true;
    }
    await company.save();

    res.status(200).json({ success: true, message: 'تم تحديث حالة الشركة بنجاح', data: { status: company.status, isVerified: company.isVerified } });
  } catch (error) {
    console.error('Update Status Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تحديث الحالة' });
  }
};

// @desc    جلب متابعي شركة
// @route   GET /api/companies/:id/followers
// @access  Private
exports.getCompanyFollowers = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id)
      .populate('followers.user', 'profile.firstName profile.lastName profile.avatar profile.headline');

    if (!company) {
      return res.status(404).json({ success: false, message: 'الشركة غير موجودة' });
    }

    const followersData = company.followers.map(f => ({
      user: f.user,
      followedAt: f.followedAt
    }));

    res.status(200).json({
      success: true,
      count: followersData.length,
      data: followersData,
    });
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ success: false, message: 'الشركة غير موجودة' });
    }
    console.error('Get Followers Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
  }
};

// @desc    إضافة / تحديث تقييم لشركة
// @route   POST /api/companies/:id/ratings
// @access  Private
exports.addRating = async (req, res) => {
  try {
    const { rating, review } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'التقييم يجب أن يكون بين 1 و 5' });
    }

    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ success: false, message: 'الشركة غير موجودة' });
    }

    const existingIndex = company.ratings.findIndex(
      r => r.user.toString() === req.user._id.toString()
    );

    if (existingIndex > -1) {
      company.ratings[existingIndex].rating = rating;
      company.ratings[existingIndex].review = review || '';
    } else {
      company.ratings.push({
        user: req.user._id,
        rating,
        review: review || '',
      });
    }

    company.calcAverageRating();
    await company.save();

    res.status(200).json({
      success: true,
      message: existingIndex > -1 ? 'تم تحديث التقييم بنجاح' : 'تمت إضافة التقييم بنجاح',
      averageRating: company.averageRating,
      ratingsCount: company.ratings.length,
    });
  } catch (error) {
    console.error('Add Rating Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء إضافة التقييم' });
  }
};

// @desc    جلب تقييمات شركة
// @route   GET /api/companies/:id/ratings
// @access  Private
exports.getCompanyRatings = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id)
      .populate('ratings.user', 'profile.firstName profile.lastName profile.avatar');

    if (!company) {
      return res.status(404).json({ success: false, message: 'الشركة غير موجودة' });
    }

    res.status(200).json({
      success: true,
      averageRating: company.averageRating,
      ratingsCount: company.ratings.length,
      data: company.ratings,
    });
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ success: false, message: 'الشركة غير موجودة' });
    }
    console.error('Get Ratings Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
  }
};

// @desc    حذف تقييم المستخدم لشركة
// @route   DELETE /api/companies/:id/ratings
// @access  Private
exports.deleteRating = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ success: false, message: 'الشركة غير موجودة' });
    }

    const index = company.ratings.findIndex(
      r => r.user.toString() === req.user._id.toString()
    );

    if (index === -1) {
      return res.status(404).json({ success: false, message: 'ليس لديك تقييم لهذه الشركة' });
    }

    company.ratings.splice(index, 1);
    company.calcAverageRating();
    await company.save();

    res.status(200).json({
      success: true,
      message: 'تم حذف التقييم بنجاح',
      averageRating: company.averageRating,
      ratingsCount: company.ratings.length,
    });
  } catch (error) {
    console.error('Delete Rating Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء حذف التقييم' });
  }
};

// @desc    جلب إحصائيات الشركة التفصيلية
// @route   GET /api/companies/:id/stats
// @access  Private (owner, admin, or employee)
exports.getCompanyStats = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);

    if (!company) {
      return res.status(404).json({ success: false, message: 'الشركة غير موجودة' });
    }

    // التحقق من الصلاحيات
    const isOwner = company.owner.toString() === req.user._id.toString();
    const isAdmin = company.admins.some(a => a.toString() === req.user._id.toString());
    const isEmployee = company.employees.some(e => e.user.toString() === req.user._id.toString());
    
    if (!isOwner && !isAdmin && !isEmployee) {
      return res.status(403).json({ 
        success: false, 
        message: 'غير مصرح لك برؤية إحصائيات الشركة' 
      });
    }

    const companyId = company._id;

    // ==========================================
    // 1. إحصائيات الفريق
    // ==========================================
    const teamStats = {
      owner: 1,
      admins: company.admins.length,
      employees: company.employees.length,
      totalTeam: 1 + company.admins.length + company.employees.length
    };

    // ==========================================
    // 2. إحصائيات الوظائف
    // ==========================================
    const totalJobs = await Job.countDocuments({ company: companyId });
    const openJobs = await Job.countDocuments({ company: companyId, status: 'Open' });
    const closedJobs = await Job.countDocuments({ company: companyId, status: 'Closed' });

    const jobsByType = await Job.aggregate([
      { $match: { company: companyId } },
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);

    const jobsByWorkLevel = await Job.aggregate([
      { $match: { company: companyId } },
      { $group: { _id: '$workLevel', count: { $sum: 1 } } }
    ]);

    const jobsByWorkPlace = await Job.aggregate([
      { $match: { company: companyId } },
      { $group: { _id: '$workPlace', count: { $sum: 1 } } }
    ]);

    // ==========================================
    // 3. إحصائيات المتقدمين
    // ==========================================
    const companyJobs = await Job.find({ company: companyId }).select('_id');
    const jobIds = companyJobs.map(j => j._id);

    const totalApplicants = await Job.countDocuments({ 
      job: { $in: jobIds } 
    });

    // ==========================================
    // 4. إحصائيات التقييمات
    // ==========================================
    const ratingsStats = {
      averageRating: company.averageRating,
      totalRatings: company.ratings.length,
      distribution: {
        5: company.ratings.filter(r => r.rating === 5).length,
        4: company.ratings.filter(r => r.rating === 4).length,
        3: company.ratings.filter(r => r.rating === 3).length,
        2: company.ratings.filter(r => r.rating === 2).length,
        1: company.ratings.filter(r => r.rating === 1).length
      }
    };

    // ==========================================
    // 5. إحصائيات المتابعين الشهرية (آخر 12 شهر)
    // ==========================================
    const monthlyFollowers = [];
    const now = new Date();
    
    for (let i = 11; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      
      const followersInMonth = company.followers.filter(f => {
        const followDate = new Date(f.followedAt);
        return followDate >= monthStart && followDate <= monthEnd;
      }).length;

      const totalFollowersUntilMonth = company.followers.filter(f => {
        const followDate = new Date(f.followedAt);
        return followDate <= monthEnd;
      }).length;

      monthlyFollowers.push({
        month: monthStart.toLocaleString('ar-SA', { month: 'long', year: 'numeric' }),
        monthKey: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`,
        newFollowers: followersInMonth,
        totalFollowers: totalFollowersUntilMonth
      });
    }

    // ==========================================
    // 6. إحصائيات المتابعين اليومية (آخر 30 يوم)
    // ==========================================
    const dailyFollowers = [];
    
    for (let i = 29; i >= 0; i--) {
      const dayStart = new Date(now);
      dayStart.setDate(now.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);
      
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const followersInDay = company.followers.filter(f => {
        const followDate = new Date(f.followedAt);
        return followDate >= dayStart && followDate <= dayEnd;
      }).length;

      dailyFollowers.push({
        date: dayStart.toISOString().split('T')[0],
        dayName: dayStart.toLocaleString('ar-SA', { weekday: 'long' }),
        newFollowers: followersInDay
      });
    }

    // ==========================================
    // 7. إحصائيات نمو المتابعين
    // ==========================================
    const totalFollowers = company.followersCount;
    
    // متابعين هذا الشهر
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonthFollowers = company.followers.filter(f => 
      new Date(f.followedAt) >= thisMonthStart
    ).length;

    // متابعين الشهر الماضي
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    const lastMonthFollowers = company.followers.filter(f => {
      const followDate = new Date(f.followedAt);
      return followDate >= lastMonthStart && followDate <= lastMonthEnd;
    }).length;

    // نسبة النمو الشهرية
    const monthlyGrowthRate = lastMonthFollowers > 0 
      ? Math.round(((thisMonthFollowers - lastMonthFollowers) / lastMonthFollowers) * 100)
      : thisMonthFollowers > 0 ? 100 : 0;

    // متابعين هذا الأسبوع
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const thisWeekFollowers = company.followers.filter(f => 
      new Date(f.followedAt) >= weekStart
    ).length;

    // متابعين اليوم
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayFollowers = company.followers.filter(f => 
      new Date(f.followedAt) >= todayStart
    ).length;

    const followerGrowth = {
      total: totalFollowers,
      today: todayFollowers,
      thisWeek: thisWeekFollowers,
      thisMonth: thisMonthFollowers,
      lastMonth: lastMonthFollowers,
      monthlyGrowthRate: monthlyGrowthRate,
      averagePerDay: totalFollowers > 0 ? Math.round((totalFollowers / Math.max(1, Math.floor((now - new Date(company.createdAt)) / (1000 * 60 * 60 * 24)))) * 10) / 10 : 0
    };

    // ==========================================
    // 8. إحصائيات نشر الوظائف الشهرية
    // ==========================================
    const monthlyJobs = [];
    
    for (let i = 11; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      
      const jobsInMonth = await Job.countDocuments({
        company: companyId,
        createdAt: { $gte: monthStart, $lte: monthEnd }
      });

      monthlyJobs.push({
        month: monthStart.toLocaleString('ar-SA', { month: 'long', year: 'numeric' }),
        monthKey: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`,
        jobsPosted: jobsInMonth
      });
    }

    // ==========================================
    // 9. ملخص الأداء
    // ==========================================
    const companyAge = Math.floor((now - new Date(company.createdAt)) / (1000 * 60 * 60 * 24));
    
    const performanceSummary = {
      companyAgeDays: companyAge,
      jobsPerMonth: companyAge > 0 ? Math.round((totalJobs / (companyAge / 30)) * 10) / 10 : 0,
      applicantsPerJob: totalJobs > 0 ? Math.round((totalApplicants / totalJobs) * 10) / 10 : 0,
      followersPerDay: companyAge > 0 ? Math.round((totalFollowers / companyAge) * 10) / 10 : 0
    };

    // ==========================================
    // الاستجابة النهائية
    // ==========================================
    res.status(200).json({
      success: true,
      data: {
        company: {
          id: company._id,
          name: company.name,
          industry: company.industry,
          status: company.status,
          isVerified: company.isVerified,
          createdAt: company.createdAt
        },
        team: teamStats,
        jobs: {
          total: totalJobs,
          open: openJobs,
          closed: closedJobs,
          byType: jobsByType,
          byWorkLevel: jobsByWorkLevel,
          byWorkPlace: jobsByWorkPlace
        },
        applicants: {
          total: totalApplicants
        },
        ratings: ratingsStats,
        followers: followerGrowth,
        monthlyFollowers: monthlyFollowers,
        dailyFollowers: dailyFollowers,
        monthlyJobs: monthlyJobs,
        performance: performanceSummary
      }
    });
  } catch (error) {
    console.error('Get Company Stats Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب الإحصائيات' });
  }
};

// @desc    جلب أفضل 5 مديرين حسب تقييم الشركات ونقاط السمعة
// @route   GET /api/companies/leaderboard/top-managers
// @access  Public
exports.getTopManagers = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 5, 10);

    // جلب الشركات المعتمدة فقط
    const companies = await Company.find({ status: 'Approved' })
      .select('name owner admins averageRating followersCount logo industry')
      .populate('owner', 'username profile.firstName profile.lastName profile.fullname profile.avatar profile.headline profile.rScore role');

    // تجميع المديرين (المالكين + المدراء) مع معلومات شركاتهم
    const managersMap = new Map();

    for (const company of companies) {
      // إضافة المالك
      if (company.owner && company.owner._id) {
        const ownerId = company.owner._id.toString();
        if (!managersMap.has(ownerId)) {
          managersMap.set(ownerId, {
            user: {
              _id: company.owner._id,
              username: company.owner.username,
              profile: company.owner.profile,
              role: company.owner.role
            },
            companies: [],
            totalRating: 0,
            totalFollowers: 0
          });
        }
        const manager = managersMap.get(ownerId);
        manager.companies.push({
          _id: company._id,
          name: company.name,
          logo: company.logo,
          industry: company.industry,
          averageRating: company.averageRating,
          followersCount: company.followersCount
        });
        manager.totalRating += company.averageRating || 0;
        manager.totalFollowers += company.followersCount || 0;
      }

      // إضافة المدراء الإضافيين
      if (company.admins && company.admins.length > 0) {
        for (const adminId of company.admins) {
          const adminIdStr = adminId.toString();
          if (!managersMap.has(adminIdStr)) {
            // جلب بيانات المدير
            const User = require('../models/User');
            const adminUser = await User.findById(adminId)
              .select('username profile.firstName profile.lastName profile.fullname profile.avatar profile.headline profile.rScore role');

            if (adminUser) {
              managersMap.set(adminIdStr, {
                user: {
                  _id: adminUser._id,
                  username: adminUser.username,
                  profile: adminUser.profile,
                  role: adminUser.role
                },
                companies: [],
                totalRating: 0,
                totalFollowers: 0
              });
            }
          }

          if (managersMap.has(adminIdStr)) {
            const manager = managersMap.get(adminIdStr);
            manager.companies.push({
              _id: company._id,
              name: company.name,
              logo: company.logo,
              industry: company.industry,
              averageRating: company.averageRating,
              followersCount: company.followersCount
            });
            manager.totalRating += company.averageRating || 0;
            manager.totalFollowers += company.followersCount || 0;
          }
        }
      }
    }

    // تحويل إلى مصفوفة وترتيب حسب نقاط السمعة ثم متوسط تقييم الشركات
    const managers = Array.from(managersMap.values())
      .sort((a, b) => {
        // الترتيب أولاً حسب R-Score
        const aScore = a.user.profile?.rScore || 0;
        const bScore = b.user.profile?.rScore || 0;
        if (bScore !== aScore) return bScore - aScore;
        // ثم حسب متوسط تقييم الشركات
        return (b.totalRating / b.companies.length) - (a.totalRating / a.companies.length);
      })
      .slice(0, limit);

    res.status(200).json({
      success: true,
      count: managers.length,
      data: managers.map(m => ({
        manager: m.user,
        companies: m.companies,
        companiesCount: m.companies.length,
        averageCompanyRating: Math.round((m.totalRating / m.companies.length) * 10) / 10,
        totalFollowers: m.totalFollowers
      }))
    });
  } catch (error) {
    console.error('Get Top Managers Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب أفضل المديرين' });
  }
};