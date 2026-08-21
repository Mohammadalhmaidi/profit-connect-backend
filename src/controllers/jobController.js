const Job = require('../models/Job');
const { sanitizeError } = require('../utils/sanitizeError');
const { escapeRegex } = require('../utils/regex');
const Company = require('../models/Company');
const JobApplication = require('../models/JobApplication');
const { buildResumeUrl, deleteResumeFile } = require('../utils/resumeStorage');

// ==========================================
// @desc    نشر وظيفة جديدة
// @route   POST /api/jobs
// @access  Private (يجب أن يكون المستخدم مديراً في الشركة أو موظف بصلاحية النشر)
// ==========================================
exports.createJob = async (req, res) => {
  try {
    const { companyId } = req.body;

    // 1. التأكد من أن الشركة موجودة ومعتمدة
    const company = await Company.findById(companyId);
    if (!company || company.status !== 'Approved') {
      return res.status(400).json({ 
        success: false, 
        message: 'يجب اختيار شركة معتمدة لنشر وظيفة' 
      });
    }

    // 2. التحقق من الصلاحيات: المالك، المدير، أو الموظف بصلاحية النشر
    const isOwner = company.owner.toString() === req.user._id.toString();
    const isAdmin = company.admins.some(a => a.toString() === req.user._id.toString());
    const isEmployee = req.user.role === 'CompanyEmployee' && 
                       req.user.companyEmployeeProfile?.companyId?.toString() === companyId.toString() &&
                       req.user.companyEmployeeProfile?.permissions?.canPostJobs;

    if (!isOwner && !isAdmin && !isEmployee) {
      return res.status(403).json({ 
        success: false, 
        message: 'ليس لديك صلاحية النشر بهذه الشركة' 
      });
    }

    // 3. إنشاء الوظيفة
    const job = await Job.create({
      ...req.body,
      company: companyId,
      postedBy: req.user._id
    });

    res.status(201).json({ success: true, data: job });
  } catch (error) {
    console.error('Create Job Error:', sanitizeError(error));
    res.status(500).json({ success: false, message: sanitizeError(error) });
  }
};

// ==========================================
// @desc    جلب جميع الوظائف مع فلاتر البحث
// @route   GET /api/jobs
// @access  Public (متاح للجميع)
// ==========================================
exports.getJobs = async (req, res) => {
  try {
    // بناء نظام فلاتر للبحث المتقدم
    const { search, type, workPlace, workLevel, limit, page, country, minSalary, maxSalary } = req.query;
    
    // افتراضياً نجلب الوظائف المفتوحة فقط
    let query = { status: 'Open' };

    // فلتر البحث بالنص (عنوان / وصف / موقع / متطلبات / مسؤوليات)
    if (search && String(search).trim()) {
      const esc = escapeRegex(String(search).trim());
      query.$or = [
        { title: { $regex: esc, $options: 'i' } },
        { description: { $regex: esc, $options: 'i' } },
        { location: { $regex: esc, $options: 'i' } },
        { requirements: { $regex: esc, $options: 'i' } },
        { responsibilities: { $regex: esc, $options: 'i' } },
      ];
    }

    // إضافة الفلاتر إذا تم إرسالها في الرابط
    if (type) query.type = type;
    if (workPlace) query.workPlace = workPlace;
    if (workLevel) query.workLevel = workLevel;
    if (country) query.location = { $regex: escapeRegex(country), $options: 'i' };

    // فلتر نطاق الراتب
    if (minSalary || maxSalary) {
      query['salary.min'] = {};
      query['salary.max'] = {};
      if (minSalary) query['salary.min'].$gte = Number(minSalary);
      if (maxSalary) query['salary.max'].$lte = Number(maxSalary);
    }

    // عدد النتائج المطلوبة (الافتراضي 10)
    const resultLimit = Math.min(parseInt(limit) || 10, 50);
    const resultPage = Math.max(parseInt(page) || 1, 1);

    const total = await Job.countDocuments(query);

    // جلب الوظائف وترتيبها من الأحدث للأقدم مع ترقيم صفحات حقيقي
    const jobs = await Job.find(query)
      .populate('company', 'name logo location') // جلب بيانات الشركة الأساسية مع الوظيفة
      .sort({ createdAt: -1 })
      .skip((resultPage - 1) * resultLimit)
      .limit(resultLimit);

    res.status(200).json({ 
      success: true,
      total,
      page: resultPage,
      pages: Math.max(Math.ceil(total / resultLimit), 1),
      count: jobs.length, 
      data: jobs 
    });
  } catch (error) {
    console.error('Get Jobs Error:', sanitizeError(error));
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب الوظائف' });
  }
};

// ==========================================
// @desc    جلب تفاصيل وظيفة معينة مع بيانات الشركة بشكل مفصل
// @route   GET /api/jobs/:id
// @access  Public (متاح للجميع)
// ==========================================
exports.getJobById = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id)
      .populate({
        path: 'company',
        select: 'name description industry location companySize foundedYear logo coverPhoto website socialLinks contactEmail isVerified status followersCount averageRating ratings createdAt',
        populate: {
          path: 'owner',
          select: 'profile.firstName profile.lastName profile.avatar'
        }
      })
      .populate('postedBy', 'profile.firstName profile.lastName profile.avatar profile.headline');

    if (!job) {
      return res.status(404).json({ success: false, message: 'الوظيفة غير موجودة' });
    }

    res.status(200).json({
      success: true,
      data: job
    });
  } catch (error) {
    console.error('Get Job By Id Error:', sanitizeError(error));
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ success: false, message: 'الوظيفة غير موجودة' });
    }
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب تفاصيل الوظيفة' });
  }
};

// ==========================================
// @desc    التقديم على وظيفة
// @route   POST /api/jobs/:id/apply
// @access  Private (يحتاج تسجيل دخول)
// ==========================================
exports.applyForJob = async (req, res) => {
  try {
    const jobId = req.params.id;
    const { coverLetter } = req.body;

    // 1. التأكد من أن الوظيفة موجودة ومتاحة للتقديم
    const job = await Job.findById(jobId);
    
    if (!job) {
      return res.status(404).json({ success: false, message: 'الوظيفة غير موجودة' });
    }
    
    if (job.status !== 'Open') {
      return res.status(400).json({ success: false, message: 'عذراً، تم إغلاق باب التقديم على هذه الوظيفة' });
    }

    // 2. التحقق مما إذا كان المستخدم قد قدم على هذه الوظيفة بالفعل
    const existingApplication = await JobApplication.findOne({ 
      job: jobId, 
      applicant: req.user._id 
    });

    if (existingApplication) {
      return res.status(400).json({ success: false, message: 'لقد قمت بالتقديم على هذه الوظيفة مسبقاً' });
    }

    // 3. رفع ملف السيرة الذاتية
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'يرجى رفع ملف السيرة الذاتية (PDF أو Word)' });
    }

    const resumeUrl = buildResumeUrl(req, req.file.filename);

    // 4. إنشاء طلب التوظيف
    const application = await JobApplication.create({
      job: jobId,
      applicant: req.user._id,
      coverLetter,
      resume: resumeUrl
    });

    res.status(201).json({
      success: true,
      message: 'تم إرسال طلب التقديم بنجاح! حظاً موفقاً',
      data: application
    });

  } catch (error) {
    console.error('Apply Job Error:', sanitizeError(error));
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء التقديم على الوظيفة' });
  }
};

// ==========================================
// @desc    جلب قائمة المتقدمين لوظيفة معينة
// @route   GET /api/jobs/:id/applicants
// @access  Private (يجب أن يكون المستخدم مديراً في الشركة أو موظف بصلاحية إدارة المتقدمين)
// ==========================================
exports.getJobApplicants = async (req, res) => {
  try {
    const jobId = req.params.id;

    // 1. جلب الوظيفة مع بيانات الشركة لنتأكد من الصلاحيات
    const job = await Job.findById(jobId).populate('company');
    
    if (!job) {
      return res.status(404).json({ success: false, message: 'الوظيفة غير موجودة' });
    }

    // 2. التحقق من الصلاحيات: المالك، المدير، أو الموظف بصلاحية إدارة المتقدمين
    const isOwner = job.company.owner.toString() === req.user._id.toString();
    const isAdmin = job.company.admins.some(a => a.toString() === req.user._id.toString());
    const isEmployee = req.user.role === 'CompanyEmployee' && 
                       req.user.companyEmployeeProfile?.companyId?.toString() === job.company._id.toString() &&
                       req.user.companyEmployeeProfile?.permissions?.canManageApplicants;

    if (!isOwner && !isAdmin && !isEmployee) {
      return res.status(403).json({ success: false, message: 'غير مصرح لك برؤية المتقدمين لهذه الوظيفة' });
    }

    // 3. جلب جميع طلبات التوظيف المرتبطة بهذه الوظيفة
    const applicants = await JobApplication.find({ job: jobId })
      .populate('applicant', 'profile.firstName profile.lastName profile.headline profile.avatar email') // جلب بيانات المتقدم
      .sort({ createdAt: -1 }); // ترتيب من الأحدث للأقدم

    res.status(200).json({
      success: true,
      count: applicants.length,
      data: applicants
    });

  } catch (error) {
    console.error('Get Applicants Error:', sanitizeError(error));
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب المتقدمين' });
  }
};

// ==========================================
// @desc    تحديث حالة طلب التوظيف (قبول / رفض / إلخ)
// @route   PUT /api/jobs/applications/:applicationId/status
// @access  Private (يجب أن يكون مديراً في الشركة أو موظف بصلاحية إدارة المتقدمين)
// ==========================================
exports.updateApplicationStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const applicationId = req.params.applicationId;

    // 1. التأكد من أن الحالة المرسلة صحيحة وموجودة في الـ Schema
    const validStatuses = ['Pending', 'Reviewed', 'Shortlisted', 'Rejected', 'Accepted'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'حالة الطلب غير صالحة' });
    }

    // 2. جلب طلب التوظيف مع بيانات الوظيفة والشركة
    const application = await JobApplication.findById(applicationId).populate({
      path: 'job',
      populate: { path: 'company' }
    });

    if (!application) {
      return res.status(404).json({ success: false, message: 'طلب التوظيف غير موجود' });
    }

    // 3. التحقق من الصلاحيات: المالك، المدير، أو الموظف بصلاحية إدارة المتقدمين
    const isOwner = application.job.company.owner.toString() === req.user._id.toString();
    const isAdmin = application.job.company.admins.some(a => a.toString() === req.user._id.toString());
    const isEmployee = req.user.role === 'CompanyEmployee' && 
                       req.user.companyEmployeeProfile?.companyId?.toString() === application.job.company._id.toString() &&
                       req.user.companyEmployeeProfile?.permissions?.canManageApplicants;

    if (!isOwner && !isAdmin && !isEmployee) {
      return res.status(403).json({ success: false, message: 'غير مصرح لك بتعديل حالة هذا الطلب' });
    }

    // 4. تحديث الحالة وحفظها
    application.status = status;
    await application.save();

    res.status(200).json({
      success: true,
      message: `تم تحديث حالة الطلب إلى ${status} بنجاح`,
      data: application
    });

  } catch (error) {
    console.error('Update Application Status Error:', sanitizeError(error));
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تحديث حالة الطلب' });
  }
};

// ==========================================
// @desc    جلب قائمة الوظائف التي قدم عليها المستخدم الحالي
// @route   GET /api/jobs/my-applications
// @access  Private
// ==========================================
exports.getMyApplications = async (req, res) => {
  try {
    // البحث عن جميع الطلبات التي تخص هذا المستخدم (applicant)
    const applications = await JobApplication.find({ applicant: req.user._id })
      .populate({
        path: 'job',
        select: 'title location type salary', // جلب بيانات الوظيفة
        populate: {
          path: 'company',
          select: 'name logo' // جلب اسم وشعار الشركة صاحبة الوظيفة
        }
      })
      .sort({ createdAt: -1 }); // الترتيب من الأحدث للتقديم

    res.status(200).json({
      success: true,
      count: applications.length,
      data: applications
    });
  } catch (error) {
    console.error('Get My Applications Error:', sanitizeError(error));
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب طلباتك' });
  }
};

// ==========================================
// @desc    تحديث حالة الوظيفة (Open/Closed)
// @route   PUT /api/jobs/:id/status
// @access  Private (المالك أو المدير أو الموظف بصلاحية)
// ==========================================
exports.updateJobStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const jobId = req.params.id;

    if (!['Open', 'Closed'].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'حالة الوظيفة غير صالحة. القيم المسموحة: Open, Closed' 
      });
    }

    const job = await Job.findById(jobId).populate('company');
    if (!job) {
      return res.status(404).json({ success: false, message: 'الوظيفة غير موجودة' });
    }

    const company = job.company;
    const isOwner = company.owner.toString() === req.user._id.toString();
    const isAdmin = company.admins.some(a => a.toString() === req.user._id.toString());
    const isEmployee = req.user.role === 'CompanyEmployee' && 
                       req.user.companyEmployeeProfile?.companyId?.toString() === company._id.toString() &&
                       req.user.companyEmployeeProfile?.permissions?.canPostJobs;

    if (!isOwner && !isAdmin && !isEmployee) {
      return res.status(403).json({ 
        success: false, 
        message: 'ليس لديك صلاحية تغيير حالة هذه الوظيفة' 
      });
    }

    job.status = status;
    await job.save();

    res.status(200).json({
      success: true,
      message: `تم ${status === 'Open' ? 'فتح' : 'إغلاق'} الوظيفة بنجاح`,
      data: job
    });
  } catch (error) {
    console.error('Update Job Status Error:', sanitizeError(error));
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تحديث حالة الوظيفة' });
  }
};