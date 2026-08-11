const Project = require('../models/Project');
const Proposal = require('../models/Proposal');
const User = require('../models/User');

exports.createProject = async (req, res) => {
  try {
    const { title, description, category, skills, budget, deadline } = req.body;
    const project = await Project.create({
      title, description, category, skills, budget, deadline,
      client: req.user._id,
    });

    res.status(201).json({ success: true, data: project });
  } catch (error) {
    console.error('Create Project Error:', error.message);

    // أخطاء التحقق من البيانات (حقول مفقودة أو غير صالحة)
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({
        success: false,
        message: messages.join(' | '),
        errors: Object.keys(error.errors).reduce((acc, key) => {
          acc[key] = error.errors[key].message;
          return acc;
        }, {})
      });
    }

    // معرّف بصيغة غير صالحة
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'المعرف غير صالح' });
    }

    res.status(500).json({ success: false, message: 'حدث خطأ أثناء إنشاء المشروع' });
  }
};

exports.getProjects = async (req, res) => {
  try {
    const filter = { status: 'Open' };
    if (req.query.category) filter.category = { $regex: req.query.category, $options: 'i' };
    if (req.query.search) filter.title = { $regex: req.query.search, $options: 'i' };
    if (req.query.skill) filter.skills = { $in: [new RegExp(req.query.skill, 'i')] };

    if (req.query.status) {
      if (req.query.status === 'all') {
        delete filter.status;
      } else {
        filter.status = req.query.status;
      }
    }

    if (req.query.mine === 'true') {
      filter.client = req.user._id;
    } else {
      filter.client = { $ne: req.user._id };
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const projects = await Project.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('client', 'profile.firstName profile.lastName profile.avatar');

    const total = await Project.countDocuments(filter);

    res.status(200).json({
      success: true,
      count: projects.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: projects,
    });
  } catch (error) {
    console.error('Get Projects Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب المشاريع' });
  }
};

exports.getProjectById = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('client', 'profile.firstName profile.lastName profile.avatar profile.headline')
      .populate('assignedTo', 'profile.firstName profile.lastName profile.avatar');

    if (!project) {
      return res.status(404).json({ success: false, message: 'المشروع غير موجود' });
    }

    const proposalsCount = await Proposal.countDocuments({ project: project._id });

    const responseData = project.toObject();
    responseData.proposalsCount = proposalsCount;

    res.status(200).json({ success: true, data: responseData });
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ success: false, message: 'المشروع غير موجود' });
    }
    console.error('Get Project Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
  }
};

exports.updateProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'المشروع غير موجود' });
    }
    if (project.client.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'غير مصرح لك بتعديل هذا المشروع' });
    }

    const allowed = ['title', 'description', 'category', 'skills', 'budget', 'deadline', 'attachments'];
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        project[field] = req.body[field];
      }
    }

    await project.save();
    res.status(200).json({ success: true, data: project });
  } catch (error) {
    console.error('Update Project Error:', error.message);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({
        success: false,
        message: messages.join(' | '),
        errors: Object.keys(error.errors).reduce((acc, key) => {
          acc[key] = error.errors[key].message;
          return acc;
        }, {})
      });
    }

    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تحديث المشروع' });
  }
};

exports.deleteProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'المشروع غير موجود' });
    }
    if (project.client.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'غير مصرح لك بحذف هذا المشروع' });
    }

    await Proposal.deleteMany({ project: project._id });
    await project.deleteOne();

    res.status(200).json({ success: true, message: 'تم حذف المشروع وعروضه بنجاح' });
  } catch (error) {
    console.error('Delete Project Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء حذف المشروع' });
  }
};

exports.submitProposal = async (req, res) => {
  try {
    const { bidAmount, deliveryTime, coverLetter } = req.body;

    if (!bidAmount || !deliveryTime || !coverLetter) {
      return res.status(400).json({ success: false, message: 'المبلغ ومدة التسليم ورسالة التوضيح مطلوبون' });
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'المشروع غير موجود' });
    }
    if (project.status !== 'Open') {
      return res.status(400).json({ success: false, message: 'المشروع غير متاح للعروض حالياً' });
    }
    if (project.client.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'لا يمكنك التقديم على مشروعك الخاص' });
    }

    const existing = await Proposal.findOne({ project: project._id, freelancer: req.user._id });
    if (existing) {
      return res.status(400).json({ success: false, message: 'لقد تقدمت بعرض لهذا المشروع مسبقاً' });
    }

    const proposal = await Proposal.create({
      project: project._id,
      freelancer: req.user._id,
      bidAmount,
      deliveryTime,
      coverLetter,
    });

    // إشعار لصاحب المشروع عند تقديم عرض جديد
    await User.findByIdAndUpdate(project.client, {
      $push: {
        notifications: {
          type: 'proposal_received',
          projectName: project.title,
          senderId: req.user._id,
          projectId: project._id,
          message: 'هناك عرض جديد على مشروعك',
          read: false
        }
      }
    });

    res.status(201).json({ success: true, data: proposal });
  } catch (error) {
    console.error('Submit Proposal Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تقديم العرض' });
  }
};

exports.getProposalsByProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'المشروع غير موجود' });
    }
    if (project.client.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'غير مصرح لك. فقط صاحب المشروع يمكنه رؤية العروض' });
    }

    const proposals = await Proposal.find({ project: project._id })
      .sort({ bidAmount: 1 })
      .populate('freelancer', 'profile.firstName profile.lastName profile.avatar profile.headline professional');

    res.status(200).json({ success: true, count: proposals.length, data: proposals });
  } catch (error) {
    console.error('Get Proposals Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
  }
};

exports.getMyProposals = async (req, res) => {
  try {
    const proposals = await Proposal.find({ freelancer: req.user._id })
      .sort({ createdAt: -1 })
      .populate({
        path: 'project',
        select: 'title category budget status deadline',
        populate: { path: 'client', select: 'profile.firstName profile.lastName' },
      });

    res.status(200).json({ success: true, count: proposals.length, data: proposals });
  } catch (error) {
    console.error('Get My Proposals Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
  }
};

exports.acceptProposal = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'المشروع غير موجود' });
    }
    if (project.client.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'غير مصرح لك. فقط صاحب المشروع يمكنه قبول العروض' });
    }

    const proposal = await Proposal.findById(req.params.proposalId);
    if (!proposal) {
      return res.status(404).json({ success: false, message: 'العرض غير موجود' });
    }
    if (proposal.project.toString() !== project._id.toString()) {
      return res.status(400).json({ success: false, message: 'هذا العرض لا ينتمي لهذا المشروع' });
    }

    proposal.status = 'Accepted';
    await proposal.save();

    const clientName = `${req.user.profile.firstName} ${req.user.profile.lastName}`;

    await User.findByIdAndUpdate(proposal.freelancer, {
      $push: {
        notifications: {
          type: 'proposal_accepted',
          projectName: project.title,
          clientName,
          projectId: project._id,
          proposalStatus: 'accepted',
          createdAt: new Date(),
        },
      },
    });

    // إضافة المقبول إلى فريق المشروع (يُقبل أكثر من شخص)
    const alreadyInTeam = project.team.some(
      (m) => m.freelancer.toString() === proposal.freelancer.toString()
    );
    if (!alreadyInTeam) {
      project.team.push({
        freelancer: proposal.freelancer,
        proposalId: proposal._id,
        role: proposal.coverLetter?.slice(0, 100) || 'عضو فريق',
        status: 'Working',
      });
    }

    project.status = 'InProgress';
    project.assignedTo = proposal.freelancer;
    await project.save();

    res.status(200).json({
      success: true,
      message: 'تم قبول العرض. المشروع قيد التنفيذ',
      data: { project, proposal },
    });
  } catch (error) {
    console.error('Accept Proposal Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء قبول العرض' });
  }
};

exports.completeProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'المشروع غير موجود' });
    }
    if (project.client.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'غير مصرح لك. فقط صاحب المشروع يمكنه إنهاؤه' });
    }

    project.status = 'Completed';
    project.progress = 100;
    project.endDate = project.endDate || new Date();
    project.team.forEach((m) => {
      if (m.status === 'Working') m.status = 'Completed';
    });
    await project.save();

    res.status(200).json({ success: true, message: 'تم تأكيد اكتمال المشروع', data: project });
  } catch (error) {
    console.error('Complete Project Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء إنهاء المشروع' });
  }
};

exports.rejectProposal = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'المشروع غير موجود' });
    }
    if (project.client.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'غير مصرح لك. فقط صاحب المشروع يمكنه رفض العروض' });
    }

    const proposal = await Proposal.findById(req.params.proposalId);
    if (!proposal) {
      return res.status(404).json({ success: false, message: 'العرض غير موجود' });
    }
    if (proposal.project.toString() !== project._id.toString()) {
      return res.status(400).json({ success: false, message: 'هذا العرض لا ينتمي لهذا المشروع' });
    }
    if (proposal.status !== 'Pending') {
      return res.status(400).json({ success: false, message: 'يمكن رفض العروض المعلقة فقط' });
    }

    proposal.status = 'Rejected';
    await proposal.save();

    const clientName = `${req.user.profile.firstName} ${req.user.profile.lastName}`;
    await User.findByIdAndUpdate(proposal.freelancer, {
      $push: {
        notifications: {
          type: 'proposal_rejected',
          projectName: project.title,
          clientName,
          projectId: project._id,
          proposalStatus: 'rejected',
          createdAt: new Date(),
        },
      },
    });

    res.status(200).json({ success: true, message: 'تم رفض العرض', data: proposal });
  } catch (error) {
    console.error('Reject Proposal Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء رفض العرض' });
  }
};

exports.getNotifications = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('notifications');
    const notifications = (user.notifications || []).reverse();
    res.status(200).json({ success: true, count: notifications.length, data: notifications });
  } catch (error) {
    console.error('Get Notifications Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
  }
};

exports.getRecentNotifications = async (req, res) => {
  try {
    const tenMinutesAgo = new Date(Date.now() - 15 * 1000);
    const user = await User.findById(req.user._id).select('notifications');
    const notifications = (user.notifications || []).filter(
      n => new Date(n.createdAt) >= tenMinutesAgo
    ).reverse();
    res.status(200).json({ success: true, count: notifications.length, data: notifications });
  } catch (error) {
    console.error('Get Recent Notifications Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
  }
};

exports.markNotificationRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const user = await User.findById(req.user._id);
    const notification = user.notifications.id(notificationId);
    if (!notification) {
      return res.status(404).json({ success: false, message: 'الإشعار غير موجود' });
    }
    notification.read = true;
    await user.save();
    res.status(200).json({ success: true, data: notification });
  } catch (error) {
    console.error('Mark Notification Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
  }
};

exports.markAllNotificationsRead = async (req, res) => {
  try {
    await User.updateOne(
      { _id: req.user._id },
      { $set: { 'notifications.$[].read': true } }
    );
    res.status(200).json({ success: true, message: 'تم تعليم جميع الإشعارات كمقروءة' });
  } catch (error) {
    console.error('Mark All Notifications Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
  }
};

exports.getMyProjectsWithProposals = async (req, res) => {
  try {
    const projects = await Project.find({ client: req.user._id })
      .sort({ createdAt: -1 })
      .lean({ virtuals: true });

    const projectIds = projects.map(p => p._id);
    const proposals = await Proposal.find({ project: { $in: projectIds } })
      .populate('freelancer', 'profile.firstName profile.lastName profile.avatar profile.headline professional')
      .sort({ createdAt: -1 })
      .lean();

    const proposalsByProject = {};
    for (const prop of proposals) {
      const pid = prop.project.toString();
      if (!proposalsByProject[pid]) proposalsByProject[pid] = [];
      proposalsByProject[pid].push(prop);
    }

    const data = projects.map(p => ({
      ...p,
      proposals: proposalsByProject[p._id.toString()] || [],
      proposalsCount: proposalsByProject[p._id.toString()]?.length || 0,
    }));

    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    console.error('Get My Projects With Proposals Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
  }
};

// ============================================================
// إدارة المشروع الشاملة (تواريخ، تقدم، فريق، مراحل، دفعات)
// ============================================================

// مساعدة: معالجة أخطاء Mongoose وإرجاعها للواجهة
function sendError(res, error, fallbackMsg) {
  if (error.name === 'ValidationError') {
    const messages = Object.values(error.errors).map((e) => e.message);
    return res.status(400).json({
      success: false,
      message: messages.join(' | '),
      errors: Object.keys(error.errors).reduce((acc, k) => { acc[k] = error.errors[k].message; return acc; }, {}),
    });
  }
  if (error.name === 'CastError') {
    return res.status(400).json({ success: false, message: 'المعرف غير صالح' });
  }
  if (error.code === 11000) {
    return res.status(400).json({ success: false, message: 'قيمة مكررة' });
  }
  console.error('Project Management Error:', error.message);
  return res.status(500).json({ success: false, message: fallbackMsg });
}

// مساعدة: حساب نسبة التقدم من متوسط تقدم المراحل
function computeProgress(project) {
  const ms = project.milestones || [];
  if (ms.length === 0) return project.progress || 0;
  const sum = ms.reduce((s, m) => s + (m.progress || 0), 0);
  return Math.round(sum / ms.length);
}

// مساعدة: جلب مشروع مملوء ببيانات الإدارة والتحقق من الملكية
async function loadOwnedProject(id, userId) {
  const project = await Project.findById(id)
    .populate('client', 'profile.firstName profile.lastName profile.avatar profile.headline')
    .populate('assignedTo', 'profile.firstName profile.lastName profile.avatar profile.headline')
    .populate('team.freelancer', 'profile.firstName profile.lastName profile.avatar profile.headline')
    .populate('milestones.assignedTo', 'profile.firstName profile.lastName profile.avatar profile.headline');
  if (!project) return { error: { status: 404, message: 'المشروع غير موجود' } };
  if (project.client._id.toString() !== userId.toString()) {
    return { error: { status: 403, message: 'غير مصرح لك بإدارة هذا المشروع' } };
  }
  return { project };
}

// @desc    نظرة شاملة لإدارة المشروع (كل التفاصيل)
// @route   GET /api/projects/:id/overview
// @access  Private (صاحب المشروع)
exports.getProjectOverview = async (req, res) => {
  try {
    const { project, error } = await loadOwnedProject(req.params.id, req.user._id);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const obj = project.toObject();
    obj.progress = computeProgress(project);
    obj.durationDays = project.startDate && project.endDate
      ? Math.max(0, Math.round((project.endDate - project.startDate) / 86400000))
      : null;
    obj.milestonesCount = project.milestones.length;
    obj.teamCount = project.team.length;
    obj.paymentsCount = project.payments.length;
    const total = project.payments.reduce((s, p) => s + p.amount, 0);
    const paid = project.payments.filter((p) => p.status === 'Paid').reduce((s, p) => s + p.amount, 0);
    obj.paymentsSummary = { total, paid, pending: total - paid };

    res.status(200).json({ success: true, data: obj });
  } catch (error) {
    sendError(res, error, 'حدث خطأ في جلب بيانات إدارة المشروع');
  }
};

// @desc    تحديث بيانات إدارة المشروع (تواريخ، تقدم، إعدادات الدفع)
// @route   PUT /api/projects/:id/manage
// @access  Private (صاحب المشروع)
exports.manageProject = async (req, res) => {
  try {
    const { project, error } = await loadOwnedProject(req.params.id, req.user._id);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const allowed = ['startDate', 'endDate', 'publishedAt', 'status'];
    for (const field of allowed) {
      if (req.body[field] !== undefined) project[field] = req.body[field];
    }
    if (req.body.progress !== undefined) {
      project.progress = Math.min(100, Math.max(0, Number(req.body.progress) || 0));
    }
    if (req.body.paymentsConfig !== undefined) {
      project.paymentsConfig = {
        ...project.paymentsConfig.toObject(),
        ...req.body.paymentsConfig,
      };
    }

    await project.save();
    res.status(200).json({ success: true, data: project });
  } catch (error) {
    sendError(res, error, 'حدث خطأ أثناء تحديث بيانات المشروع');
  }
};

// ============================================================
// إدارة الفريق
// ============================================================

// @desc    جلب فريق المشروع
// @route   GET /api/projects/:id/team
// @access  Private (صاحب المشروع)
exports.getProjectTeam = async (req, res) => {
  try {
    const { project, error } = await loadOwnedProject(req.params.id, req.user._id);
    if (error) return res.status(error.status).json({ success: false, message: error.message });
    res.status(200).json({ success: true, count: project.team.length, data: project.team });
  } catch (err) {
    sendError(res, err, 'حدث خطأ أثناء جلب الفريق');
  }
};

// @desc    إضافة عضو للفريق يدوياً
// @route   POST /api/projects/:id/team
// @access  Private (صاحب المشروع)
exports.addTeamMember = async (req, res) => {
  try {
    const { project, error } = await loadOwnedProject(req.params.id, req.user._id);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const { freelancerId, role, status } = req.body;
    if (!freelancerId) {
      return res.status(400).json({ success: false, message: 'معرّف المستخدم (freelancerId) مطلوب' });
    }

    const user = await User.findById(freelancerId);
    if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

    if (project.team.some((m) => m.freelancer.toString() === freelancerId.toString())) {
      return res.status(400).json({ success: false, message: 'هذا العضو مضاف للفريق مسبقاً' });
    }

    project.team.push({ freelancer: freelancerId, role, status: status || 'Invited' });
    await project.save();
    res.status(201).json({ success: true, data: project.team });
  } catch (err) {
    sendError(res, err, 'حدث خطأ أثناء إضافة عضو للفريق');
  }
};

// @desc    تحديث عضو في الفريق (الدور/الحالة)
// @route   PUT /api/projects/:id/team/:memberId
// @access  Private (صاحب المشروع)
exports.updateTeamMember = async (req, res) => {
  try {
    const { project, error } = await loadOwnedProject(req.params.id, req.user._id);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const member = project.team.id(req.params.memberId);
    if (!member) return res.status(404).json({ success: false, message: 'العضو غير موجود في الفريق' });

    const allowed = ['role', 'status'];
    for (const field of allowed) {
      if (req.body[field] !== undefined) member[field] = req.body[field];
    }

    await project.save();
    res.status(200).json({ success: true, data: project.team });
  } catch (err) {
    sendError(res, err, 'حدث خطأ أثناء تحديث العضو');
  }
};

// @desc    إزالة عضو من الفريق
// @route   DELETE /api/projects/:id/team/:memberId
// @access  Private (صاحب المشروع)
exports.removeTeamMember = async (req, res) => {
  try {
    const { project, error } = await loadOwnedProject(req.params.id, req.user._id);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const member = project.team.id(req.params.memberId);
    if (!member) return res.status(404).json({ success: false, message: 'العضو غير موجود في الفريق' });

    project.team.pull(req.params.memberId);
    await project.save();
    res.status(200).json({ success: true, message: 'تم إزالة العضو من الفريق', data: project.team });
  } catch (err) {
    sendError(res, err, 'حدث خطأ أثناء إزالة العضو');
  }
};

// ============================================================
// إدارة المخطط الزمني (المراحل)
// ============================================================

// @desc    جلب مراحل المشروع
// @route   GET /api/projects/:id/milestones
// @access  Private (صاحب المشروع)
exports.getProjectMilestones = async (req, res) => {
  try {
    const { project, error } = await loadOwnedProject(req.params.id, req.user._id);
    if (error) return res.status(error.status).json({ success: false, message: error.message });
    res.status(200).json({ success: true, count: project.milestones.length, data: project.milestones });
  } catch (err) {
    sendError(res, err, 'حدث خطأ أثناء جلب المراحل');
  }
};

// @desc    إضافة مرحلة زمنية
// @route   POST /api/projects/:id/milestones
// @access  Private (صاحب المشروع)
exports.addMilestone = async (req, res) => {
  try {
    const { project, error } = await loadOwnedProject(req.params.id, req.user._id);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const { title, description, startDate, endDate, assignedTo, status, progress } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, message: 'عنوان المرحلة مطلوب' });
    }

    project.milestones.push({
      title,
      description,
      startDate,
      endDate,
      assignedTo,
      status: status || 'NotStarted',
      progress: Math.min(100, Math.max(0, Number(progress) || 0)),
    });
    project.progress = computeProgress(project);
    await project.save();
    res.status(201).json({ success: true, data: project.milestones });
  } catch (err) {
    sendError(res, err, 'حدث خطأ أثناء إضافة المرحلة');
  }
};

// @desc    تحديث مرحلة زمنية
// @route   PUT /api/projects/:id/milestones/:milestoneId
// @access  Private (صاحب المشروع)
exports.updateMilestone = async (req, res) => {
  try {
    const { project, error } = await loadOwnedProject(req.params.id, req.user._id);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const ms = project.milestones.id(req.params.milestoneId);
    if (!ms) return res.status(404).json({ success: false, message: 'المرحلة غير موجودة' });

    const allowed = ['title', 'description', 'startDate', 'endDate', 'assignedTo', 'status', 'progress'];
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        if (field === 'progress') {
          ms.progress = Math.min(100, Math.max(0, Number(req.body.progress) || 0));
        } else {
          ms[field] = req.body[field];
        }
      }
    }

    project.progress = computeProgress(project);
    await project.save();
    res.status(200).json({ success: true, data: project.milestones });
  } catch (err) {
    sendError(res, err, 'حدث خطأ أثناء تحديث المرحلة');
  }
};

// @desc    حذف مرحلة زمنية
// @route   DELETE /api/projects/:id/milestones/:milestoneId
// @access  Private (صاحب المشروع)
exports.deleteMilestone = async (req, res) => {
  try {
    const { project, error } = await loadOwnedProject(req.params.id, req.user._id);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const ms = project.milestones.id(req.params.milestoneId);
    if (!ms) return res.status(404).json({ success: false, message: 'المرحلة غير موجودة' });

    project.milestones.pull(req.params.milestoneId);
    project.progress = computeProgress(project);
    await project.save();
    res.status(200).json({ success: true, message: 'تم حذف المرحلة', data: project.milestones });
  } catch (err) {
    sendError(res, err, 'حدث خطأ أثناء حذف المرحلة');
  }
};

// ============================================================
// إدارة الدفعات المالية
// ============================================================

// @desc    جلب دفعات المشروع
// @route   GET /api/projects/:id/payments
// @access  Private (صاحب المشروع)
exports.getProjectPayments = async (req, res) => {
  try {
    const { project, error } = await loadOwnedProject(req.params.id, req.user._id);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const total = project.payments.reduce((s, p) => s + p.amount, 0);
    const paid = project.payments.filter((p) => p.status === 'Paid').reduce((s, p) => s + p.amount, 0);

    res.status(200).json({
      success: true,
      count: project.payments.length,
      summary: { total, paid, pending: total - paid },
      data: project.payments,
    });
  } catch (err) {
    sendError(res, err, 'حدث خطأ أثناء جلب الدفعات');
  }
};

// @desc    إضافة دفعة مالية
// @route   POST /api/projects/:id/payments
// @access  Private (صاحب المشروع)
exports.addPayment = async (req, res) => {
  try {
    const { project, error } = await loadOwnedProject(req.params.id, req.user._id);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const { title, amount, dueDate, method, note } = req.body;
    if (amount === undefined || amount === null || amount === '') {
      return res.status(400).json({ success: false, message: 'مبلغ الدفعة مطلوب' });
    }

    project.payments.push({
      title,
      amount: Number(amount),
      dueDate,
      method: method || 'bank_transfer',
      note,
      status: 'Pending',
    });
    project.paymentsConfig.totalAmount = project.payments.reduce((s, p) => s + p.amount, 0);
    await project.save();
    res.status(201).json({ success: true, data: project.payments });
  } catch (err) {
    sendError(res, err, 'حدث خطأ أثناء إضافة الدفعة');
  }
};

// @desc    تحديث دفعة مالية (تعديل/تسديد)
// @route   PUT /api/projects/:id/payments/:paymentId
// @access  Private (صاحب المشروع)
exports.updatePayment = async (req, res) => {
  try {
    const { project, error } = await loadOwnedProject(req.params.id, req.user._id);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const payment = project.payments.id(req.params.paymentId);
    if (!payment) return res.status(404).json({ success: false, message: 'الدفعة غير موجودة' });

    const allowed = ['title', 'amount', 'dueDate', 'method', 'note', 'status', 'paidDate', 'transactionRef'];
    for (const field of allowed) {
      if (req.body[field] !== undefined) payment[field] = req.body[field];
    }
    if (req.body.status === 'Paid' && !payment.paidDate) {
      payment.paidDate = new Date();
    }

    project.paymentsConfig.totalAmount = project.payments.reduce((s, p) => s + p.amount, 0);
    await project.save();
    res.status(200).json({ success: true, data: project.payments });
  } catch (err) {
    sendError(res, err, 'حدث خطأ أثناء تحديث الدفعة');
  }
};

// @desc    حذف دفعة مالية
// @route   DELETE /api/projects/:id/payments/:paymentId
// @access  Private (صاحب المشروع)
exports.deletePayment = async (req, res) => {
  try {
    const { project, error } = await loadOwnedProject(req.params.id, req.user._id);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const payment = project.payments.id(req.params.paymentId);
    if (!payment) return res.status(404).json({ success: false, message: 'الدفعة غير موجودة' });

    project.payments.pull(req.params.paymentId);
    project.paymentsConfig.totalAmount = project.payments.reduce((s, p) => s + p.amount, 0);
    await project.save();
    res.status(200).json({ success: true, message: 'تم حذف الدفعة', data: project.payments });
  } catch (err) {
    sendError(res, err, 'حدث خطأ أثناء حذف الدفعة');
  }
};
