const express = require('express');
const router = express.Router();

const {
  sendConnectionRequest,
  acceptConnectionRequest,
  rejectConnectionRequest,
  cancelConnectionRequest,
  getIncomingRequests,
  getMyConnections,
  removeConnection,
  getConnectionStatus,
  getMyFollowers,
  getMyFollowing,
  searchUsers,
} = require('../controllers/networkController');

const { protect } = require('../middleware/authMiddleware');

// تطبيق الحماية على جميع المسارات
router.use(protect);

// ===== البحث =====
router.get('/search', searchUsers);

// ===== المتابعون =====
router.get('/followers', getMyFollowers);
router.get('/following', getMyFollowing);

// ===== الاتصالات =====
router.get('/connections', getMyConnections);
router.get('/requests', getIncomingRequests);
router.get('/status/:userId', getConnectionStatus);

router.post('/connect/:userId', sendConnectionRequest);
router.put('/accept/:requestId', acceptConnectionRequest);
router.put('/reject/:requestId', rejectConnectionRequest);
router.delete('/cancel/:userId', cancelConnectionRequest);
router.delete('/remove/:userId', removeConnection);

module.exports = router;
