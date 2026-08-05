const express = require('express');
const router = express.Router();

const {
  getStats,
  getUsers,
  getUserById,
  updateUserStatus,
  deleteUser,
  setUserRole,
  getCompanies,
  getPendingCompanies,
  getCompanyById,
  updateCompanyStatus,
  deleteCompany,
  getPosts,
  deletePost,
} = require('../controllers/adminController');
const { protect, admin } = require('../middleware/authMiddleware');
const {
  getFinanceOverview,
  getWithdrawals,
  reviewWithdrawal,
  getPayments,
  forceRelease,
  forceRefund,
  updateSettings,
} = require('../controllers/adminFinanceController');

// تطبيق الحارسين على جميع المسارات في هذا الملف
router.use(protect, admin);

// ===== الإحصائيات =====
router.get('/stats', getStats);

// ===== المستخدمون =====
router.get('/users', getUsers);
router.get('/users/:id', getUserById);
router.put('/users/:id/role', setUserRole);
router.put('/users/:id/status', updateUserStatus);
router.delete('/users/:id', deleteUser);

// ===== الشركات =====
router.get('/companies', getCompanies);
router.get('/companies/pending', getPendingCompanies);
router.get('/companies/:id', getCompanyById);
router.put('/companies/:id/status', updateCompanyStatus);
router.delete('/companies/:id', deleteCompany);

// ===== المحتوى (المنشورات) =====
router.get('/posts', getPosts);
router.delete('/posts/:id', deletePost);

// ===== النظام المالي (المحافظ والإسكرو والسحوبات) =====
router.get('/finance/overview', getFinanceOverview);
router.get('/finance/withdrawals', getWithdrawals);
router.put('/finance/withdrawals/:id', reviewWithdrawal);
router.get('/finance/payments', getPayments);
router.post('/finance/payments/:id/release', forceRelease);
router.post('/finance/payments/:id/refund', forceRefund);
router.put('/finance/settings', updateSettings);

module.exports = router;
