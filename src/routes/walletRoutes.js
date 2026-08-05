const express = require('express');
const router = express.Router();

const {
  getWallet,
  requestWithdrawal,
  getMyWithdrawals,
  cancelWithdrawal,
} = require('../controllers/walletController');
const { protect } = require('../middleware/authMiddleware');

// جميع مسارات المحفظة محمية (يتطلب تسجيل الدخول)
router.use(protect);

router.get('/', getWallet);
router.post('/withdraw', requestWithdrawal);
router.get('/withdrawals', getMyWithdrawals);
router.post('/withdrawals/:id/cancel', cancelWithdrawal);

module.exports = router;
