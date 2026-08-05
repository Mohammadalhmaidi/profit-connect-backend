const express = require('express');
const router = express.Router();

const {
  createDeposit,
  getMyPayments,
  releasePayment,
} = require('../controllers/paymentController');
const { protect } = require('../middleware/authMiddleware');

// جميع مسارات الدفعات محمية (يتطلب تسجيل الدخول)
router.use(protect);

router.post('/', createDeposit);
router.get('/', getMyPayments);
router.put('/:id/release', releasePayment);

module.exports = router;
