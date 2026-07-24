const Company = require('../models/Company');
const User = require('../models/User');
const Job = require('../models/Job');
const bcrypt = require('bcryptjs');

// ==========================================
// @desc    إضافة موظف جديد للشركة (إنشاء حساب جديد)
// @route   POST /api/companies/:id/employees
// @access  Private (owner or admin only)
// ==========================================
exports.addEmployee = async (req, res) => {
  try {
    const { email, password, firstName, lastName, position, permissions } = req.body;
    const companyId = req.params.id;

    // 1. التحقق من وجود الشركة
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ success: false, message: 'الشركة غير موجودة' });
    }

    // 2. التحقق من الصلاحيات (المالك أو المدير فقط)
    const isOwner = company.owner.toString() === req.user._id.toString();
    const isAdmin = company.admins.some(a => a.toString() === req.user._id.toString());
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ 
        success: false, 
        message: 'غير مصرح لك! المالك أو المدير فقط يمكنه إضافة موظفين' 
      });
    }

    // 3. التحقق من عدم وجود مستخدم بنفس الإيميل
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'البريد الإلكتروني مسجل بالفعل في النظام' 
      });
    }

    // 4. التحقق من عدم تكرار الموظف (إذا كان الإيميل مسجل مسبقاً في الشركة)
    const alreadyEmployee = company.employees.some(
      e => e.user.toString() === existingUser?._id?.toString()
    );
    if (alreadyEmployee) {
      return res.status(400).json({ 
        success: false, 
        message: 'هذا الموظف مسجل بالفعل في الشركة' 
      });
    }

    // 5. إنشاء حساب المستخدم الجديد بدور CompanyEmployee
    const employeeUser = await User.create({
      email,
      password,
      role: 'CompanyEmployee',
      profile: {
        firstName,
        lastName
      },
      companyEmployeeProfile: {
        companyId: company._id,
        position: position || '',
        permissions: {
          canPostJobs: permissions?.canPostJobs ?? true,
          canManageApplicants: permissions?.canManageApplicants ?? true,
          canViewAnalytics: permissions?.canViewAnalytics ?? false
        },
        addedBy: req.user._id
      }
    });

    // 6. إضافة الموظف لمصفوفة موظفي الشركة
    company.employees.push({
      user: employeeUser._id,
      position: position || '',
      permissions: {
        canPostJobs: permissions?.canPostJobs ?? true,
        canManageApplicants: permissions?.canManageApplicants ?? true,
        canViewAnalytics: permissions?.canViewAnalytics ?? false
      },
      addedBy: req.user._id
    });
    await company.save();

    // 7. إرسال إشعار للموظف الجديد
    employeeUser.notifications.push({
      type: 'employee_added',
      companyId: company._id,
      message: `تم إضافةك كموظف في شركة ${company.name}. يمكنك الآن إدارة الوظائف والمتقدمين.`,
      read: false
    });
    await employeeUser.save();

    res.status(201).json({
      success: true,
      message: 'تم إضافة الموظف بنجاح وإنشاء حسابه',
      data: {
        employee: {
          id: employeeUser._id,
          email: employeeUser.email,
          firstName: employeeUser.profile.firstName,
          lastName: employeeUser.profile.lastName,
          position: position || '',
          permissions: {
            canPostJobs: permissions?.canPostJobs ?? true,
            canManageApplicants: permissions?.canManageApplicants ?? true,
            canViewAnalytics: permissions?.canViewAnalytics ?? false
          }
        },
        loginCredentials: {
          email,
          password // كلمة المرور الأصلية (للمشاركة مع الموظف)
        }
      }
    });
  } catch (error) {
    console.error('Add Employee Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء إضافة الموظف' });
  }
};

// ==========================================
// @desc    جلب جميع موظفي الشركة
// @route   GET /api/companies/:id/employees
// @access  Private (owner or admin only)
// ==========================================
exports.getCompanyEmployees = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id)
      .populate('employees.user', 'email profile.firstName profile.lastName profile.avatar')
      .populate('employees.addedBy', 'profile.firstName profile.lastName');

    if (!company) {
      return res.status(404).json({ success: false, message: 'الشركة غير موجودة' });
    }

    // التحقق من الصلاحيات
    const isOwner = company.owner.toString() === req.user._id.toString();
    const isAdmin = company.admins.some(a => a.toString() === req.user._id.toString());
    const isEmployee = company.employees.some(e => e.user._id.toString() === req.user._id.toString());
    
    if (!isOwner && !isAdmin && !isEmployee) {
      return res.status(403).json({ 
        success: false, 
        message: 'غير مصرح لك برؤية موظفي الشركة' 
      });
    }

    res.status(200).json({
      success: true,
      count: company.employees.length,
      data: company.employees
    });
  } catch (error) {
    console.error('Get Employees Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب الموظفين' });
  }
};

// ==========================================
// @desc    حذف موظف من الشركة
// @route   DELETE /api/companies/:id/employees/:employeeId
// @access  Private (owner only)
// ==========================================
exports.removeEmployee = async (req, res) => {
  try {
    const { id: companyId, employeeId } = req.params;

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ success: false, message: 'الشركة غير موجودة' });
    }

    // فقط المالك يمكنه حذف الموظفين
    if (company.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'غير مصرح لك! المالك فقط يمكنه حذف الموظفين' 
      });
    }

    // التحقق من وجود الموظف في الشركة
    const employeeIndex = company.employees.findIndex(
      e => e.user.toString() === employeeId
    );
    
    if (employeeIndex === -1) {
      return res.status(404).json({ 
        success: false, 
        message: 'الموظف غير موجود في هذه الشركة' 
      });
    }

    // حذف الموظف من مصفوفة الموظفين
    company.employees.splice(employeeIndex, 1);
    await company.save();

    // تحديث دور المستخدم إلى JobSeeker (إرجاعه لوضع الباحث عن عمل)
    await User.findByIdAndUpdate(employeeId, {
      role: 'JobSeeker',
      companyEmployeeProfile: undefined
    });

    // إرسال إشعار للموظف المحذوف
    const removedUser = await User.findById(employeeId);
    if (removedUser) {
      removedUser.notifications.push({
        type: 'employee_removed',
        companyId: company._id,
        message: `تم إزالتك من موظفي شركة ${company.name}.`,
        read: false
      });
      await removedUser.save();
    }

    res.status(200).json({
      success: true,
      message: 'تم حذف الموظف بنجاح'
    });
  } catch (error) {
    console.error('Remove Employee Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء حذف الموظف' });
  }
};

// ==========================================
// @desc    تحديث صلاحيات موظف
// @route   PUT /api/companies/:id/employees/:employeeId
// @access  Private (owner or admin only)
// ==========================================
exports.updateEmployee = async (req, res) => {
  try {
    const { id: companyId, employeeId } = req.params;
    const { position, permissions } = req.body;

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ success: false, message: 'الشركة غير موجودة' });
    }

    // التحقق من الصلاحيات
    const isOwner = company.owner.toString() === req.user._id.toString();
    const isAdmin = company.admins.some(a => a.toString() === req.user._id.toString());
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ 
        success: false, 
        message: 'غير مصرح لك بتعديل صلاحيات الموظفين' 
      });
    }

    // البحث عن الموظف في الشركة
    const employee = company.employees.find(
      e => e.user.toString() === employeeId
    );
    
    if (!employee) {
      return res.status(404).json({ 
        success: false, 
        message: 'الموظف غير موجود في هذه الشركة' 
      });
    }

    // تحديث البيانات
    if (position !== undefined) employee.position = position;
    if (permissions) {
      if (permissions.canPostJobs !== undefined) employee.permissions.canPostJobs = permissions.canPostJobs;
      if (permissions.canManageApplicants !== undefined) employee.permissions.canManageApplicants = permissions.canManageApplicants;
      if (permissions.canViewAnalytics !== undefined) employee.permissions.canViewAnalytics = permissions.canViewAnalytics;
    }
    await company.save();

    // تحديث بيانات الموظف في User model أيضاً
    await User.findByIdAndUpdate(employeeId, {
      'companyEmployeeProfile.position': employee.position,
      'companyEmployeeProfile.permissions': employee.permissions
    });

    res.status(200).json({
      success: true,
      message: 'تم تحديث بيانات الموظف بنجاح',
      data: employee
    });
  } catch (error) {
    console.error('Update Employee Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تحديث بيانات الموظف' });
  }
};

// ==========================================
// @desc    جلب معلومات الشركة الخاصة بالموظف (لوحة التحكم)
// @route   GET /api/employee/my-company
// @access  Private (CompanyEmployee only)
// ==========================================
exports.getMyCompany = async (req, res) => {
  try {
    // التحقق من أن المستخدم موظف شركة
    if (req.user.role !== 'CompanyEmployee') {
      return res.status(403).json({ 
        success: false, 
        message: 'غير مصرح لك! هذا المسار مخصص لموظفي الشركات فقط' 
      });
    }

    const companyId = req.user.companyEmployeeProfile?.companyId;
    if (!companyId) {
      return res.status(404).json({ 
        success: false, 
        message: 'لم يتم ربطك بأي شركة' 
      });
    }

    const company = await Company.findById(companyId)
      .select('name description industry location logo coverPhoto status isVerified');

    if (!company) {
      return res.status(404).json({ success: false, message: 'الشركة غير موجودة' });
    }

    // جلب إحصائيات سريعة
    const jobsCount = await Job.countDocuments({ company: companyId });
    const openJobsCount = await Job.countDocuments({ company: companyId, status: 'Open' });

    res.status(200).json({
      success: true,
      data: {
        company,
        stats: {
          totalJobs: jobsCount,
          openJobs: openJobsCount
        },
        myPermissions: req.user.companyEmployeeProfile?.permissions || {}
      }
    });
  } catch (error) {
    console.error('Get My Company Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب بيانات الشركة' });
  }
};

// ==========================================
// @desc    جلب وظائف الشركة (للموظف)
// @route   GET /api/employee/jobs
// @access  Private (CompanyEmployee only)
// ==========================================
exports.getCompanyJobs = async (req, res) => {
  try {
    if (req.user.role !== 'CompanyEmployee') {
      return res.status(403).json({ 
        success: false, 
        message: 'غير مصرح لك! هذا المسار مخصص لموظفي الشركات فقط' 
      });
    }

    const companyId = req.user.companyEmployeeProfile?.companyId;
    if (!companyId) {
      return res.status(404).json({ 
        success: false, 
        message: 'لم يتم ربطك بأي شركة' 
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = { company: companyId };
    if (req.query.status) filter.status = req.query.status;

    const jobs = await Job.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('company', 'name logo');

    const total = await Job.countDocuments(filter);

    res.status(200).json({
      success: true,
      count: jobs.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: jobs
    });
  } catch (error) {
    console.error('Get Company Jobs Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب الوظائف' });
  }
};

// ==========================================
// @desc    نشر وظيفة جديدة (للموظف)
// @route   POST /api/employee/jobs
// @access  Private (CompanyEmployee only - must have canPostJobs permission)
// ==========================================
exports.createJob = async (req, res) => {
  try {
    if (req.user.role !== 'CompanyEmployee') {
      return res.status(403).json({ 
        success: false, 
        message: 'غير مصرح لك! هذا المسار مخصص لموظفي الشركات فقط' 
      });
    }

    // التحقق من الصلاحية
    if (!req.user.companyEmployeeProfile?.permissions?.canPostJobs) {
      return res.status(403).json({ 
        success: false, 
        message: 'ليس لديك صلاحية نشر الوظائف' 
      });
    }

    const companyId = req.user.companyEmployeeProfile?.companyId;
    if (!companyId) {
      return res.status(404).json({ 
        success: false, 
        message: 'لم يتم ربطك بأي شركة' 
      });
    }

    // التحقق من أن الشركة معتمدة
    const company = await Company.findById(companyId);
    if (!company || company.status !== 'Approved') {
      return res.status(400).json({ 
        success: false, 
        message: 'يجب أن تكون الشركة معتمدة لنشر وظيفة' 
      });
    }

    const job = await Job.create({
      ...req.body,
      company: companyId,
      postedBy: req.user._id
    });

    res.status(201).json({ success: true, data: job });
  } catch (error) {
    console.error('Employee Create Job Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء نشر الوظيفة' });
  }
};

// ==========================================
// @desc    جلب متقدمي وظيفة معينة (للموظف)
// @route   GET /api/employee/jobs/:id/applicants
// @access  Private (CompanyEmployee only - must have canManageApplicants permission)
// ==========================================
exports.getJobApplicants = async (req, res) => {
  try {
    if (req.user.role !== 'CompanyEmployee') {
      return res.status(403).json({ 
        success: false, 
        message: 'غير مصرح لك! هذا المسار مخصص لموظفي الشركات فقط' 
      });
    }

    // التحقق من الصلاحية
    if (!req.user.companyEmployeeProfile?.permissions?.canManageApplicants) {
      return res.status(403).json({ 
        success: false, 
        message: 'ليس لديك صلاحية إدارة المتقدمين' 
      });
    }

    const companyId = req.user.companyEmployeeProfile?.companyId;
    const job = await Job.findById(req.params.id).populate('company');

    if (!job) {
      return res.status(404).json({ success: false, message: 'الوظيفة غير موجودة' });
    }

    // التحقق من أن الوظيفة تنتمي لشركة الموظف
    if (job.company._id.toString() !== companyId.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'غير مصرح لك برؤية متقدمي هذه الوظيفة' 
      });
    }

    const applicants = await Job.find({ job: req.params.id })
      .populate('applicant', 'profile.firstName profile.lastName profile.headline profile.avatar email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: applicants.length,
      data: applicants
    });
  } catch (error) {
    console.error('Employee Get Applicants Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب المتقدمين' });
  }
};

// ==========================================
// @desc    تحديث حالة طلب التوظيف (للموظف)
// @route   PUT /api/employee/jobs/applications/:applicationId/status
// @access  Private (CompanyEmployee only - must have canManageApplicants permission)
// ==========================================
exports.updateApplicationStatus = async (req, res) => {
  try {
    if (req.user.role !== 'CompanyEmployee') {
      return res.status(403).json({ 
        success: false, 
        message: 'غير مصرح لك! هذا المسار مخصص لموظفي الشركات فقط' 
      });
    }

    // التحقق من الصلاحية
    if (!req.user.companyEmployeeProfile?.permissions?.canManageApplicants) {
      return res.status(403).json({ 
        success: false, 
        message: 'ليس لديك صلاحية إدارة المتقدمين' 
      });
    }

    const { status } = req.body;
    const { applicationId } = req.params;
    const companyId = req.user.companyEmployeeProfile?.companyId;

    const validStatuses = ['Pending', 'Reviewed', 'Shortlisted', 'Rejected', 'Accepted'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'حالة الطلب غير صالحة' });
    }

    const application = await Job.findById(applicationId).populate({
      path: 'job',
      populate: { path: 'company' }
    });

    if (!application) {
      return res.status(404).json({ success: false, message: 'طلب التوظيف غير موجود' });
    }

    // التحقق من أن الطلب ينتمي لشركة الموظف
    if (application.job.company._id.toString() !== companyId.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'غير مصرح لك بتعديل حالة هذا الطلب' 
      });
    }

    application.status = status;
    await application.save();

    res.status(200).json({
      success: true,
      message: `تم تحديث حالة الطلب إلى ${status} بنجاح`,
      data: application
    });
  } catch (error) {
    console.error('Employee Update Status Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تحديث حالة الطلب' });
  }
};

// ==========================================
// @desc    جلب إحصائيات الشركة (للموظف)
// @route   GET /api/employee/stats
// @access  Private (CompanyEmployee only - must have canViewAnalytics permission)
// ==========================================
exports.getCompanyStats = async (req, res) => {
  try {
    if (req.user.role !== 'CompanyEmployee') {
      return res.status(403).json({ 
        success: false, 
        message: 'غير مصرح لك! هذا المسار مخصص لموظفي الشركات فقط' 
      });
    }

    // التحقق من الصلاحية
    if (!req.user.companyEmployeeProfile?.permissions?.canViewAnalytics) {
      return res.status(403).json({ 
        success: false, 
        message: 'ليس لديك صلاحية عرض الإحصائيات' 
      });
    }

    const companyId = req.user.companyEmployeeProfile?.companyId;

    const totalJobs = await Job.countDocuments({ company: companyId });
    const openJobs = await Job.countDocuments({ company: companyId, status: 'Open' });
    const closedJobs = await Job.countDocuments({ company: companyId, status: 'Closed' });

    // جلب إجمالي المتقدمين لجميع وظائف الشركة
    const jobs = await Job.find({ company: companyId }).select('_id');
    const jobIds = jobs.map(j => j._id);
    
    const JobApplication = require('../models/Job');
    const totalApplicants = await JobApplication.countDocuments({ 
      job: { $in: jobIds } 
    });

    res.status(200).json({
      success: true,
      data: {
        totalJobs,
        openJobs,
        closedJobs,
        totalApplicants
      }
    });
  } catch (error) {
    console.error('Get Stats Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب الإحصائيات' });
  }
};
