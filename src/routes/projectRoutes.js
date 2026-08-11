const express = require('express');
const router = express.Router();

const {
  createProject,
  getProjects,
  getProjectById,
  updateProject,
  deleteProject,
  submitProposal,
  getProposalsByProject,
  getMyProposals,
  acceptProposal,
  rejectProposal,
  completeProject,
  getMyProjectsWithProposals,
  getNotifications,
  getRecentNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getProjectOverview,
  manageProject,
  getProjectTeam,
  addTeamMember,
  updateTeamMember,
  removeTeamMember,
  getProjectMilestones,
  addMilestone,
  updateMilestone,
  deleteMilestone,
  getProjectPayments,
  addPayment,
  updatePayment,
  deletePayment,
} = require('../controllers/projectController');

const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.route('/')
  .post(createProject)
  .get(getProjects);

router.get('/my-proposals', getMyProposals);
router.get('/my-projects-with-proposals', getMyProjectsWithProposals);

router.get('/notifications', getNotifications);
router.get('/notifications/recent', getRecentNotifications);
router.put('/notifications/:notificationId/read', markNotificationRead);
router.put('/notifications/read-all', markAllNotificationsRead);

// ===== إدارة المشروع الشاملة =====
router.get('/:id/overview', getProjectOverview);
router.put('/:id/manage', manageProject);

// الفريق
router.get('/:id/team', getProjectTeam);
router.post('/:id/team', addTeamMember);
router.put('/:id/team/:memberId', updateTeamMember);
router.delete('/:id/team/:memberId', removeTeamMember);

// المخطط الزمني (المراحل)
router.get('/:id/milestones', getProjectMilestones);
router.post('/:id/milestones', addMilestone);
router.put('/:id/milestones/:milestoneId', updateMilestone);
router.delete('/:id/milestones/:milestoneId', deleteMilestone);

// الدفعات المالية
router.get('/:id/payments', getProjectPayments);
router.post('/:id/payments', addPayment);
router.put('/:id/payments/:paymentId', updatePayment);
router.delete('/:id/payments/:paymentId', deletePayment);

router.route('/:id')
  .get(getProjectById)
  .put(updateProject)
  .delete(deleteProject);

router.post('/:id/proposals', submitProposal);
router.get('/:id/proposals', getProposalsByProject);
router.post('/:id/proposals/:proposalId/accept', acceptProposal);
router.post('/:id/proposals/:proposalId/reject', rejectProposal);
router.patch('/:id/complete', completeProject);

module.exports = router;
