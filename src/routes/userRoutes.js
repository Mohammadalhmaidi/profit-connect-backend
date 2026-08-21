const express = require('express');
const { sanitizeError } = require('../utils/sanitizeError');
const router = express.Router();

const { 
  getUserProfile, 
  updateUserProfile, 
  deleteUserProfile,
  getUserById,
  updateUserAvatar,
  getSettings,
  updateSettings,
  toggleFollow,
  getFollowers,
  getFollowing,
  changePassword,
  exportData,
  getReputationScore,
  savePost,
  unsavePost,
  getSavedPosts,
  saveJob,
  unsaveJob,
  getSavedJobs,
  getTopUsers
} = require('../controllers/userController');

// 2. استدعاء حارس البوابة
const { protect } = require('../middleware/authMiddleware');
const { uploadAvatar } = require('../middleware/uploadMiddleware');

const avatarUploadHandler = (req, res, next) => {
  uploadAvatar.single('avatar')(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        success: false,
        message: sanitizeError(error),
      });
    }

    next();
  });
};

// مسار الحصول على الملف الشخصي: GET /api/user/profile
router.get('/profile', protect, getUserProfile);
router.put('/profile', protect, updateUserProfile);
router.delete('/profile', protect, deleteUserProfile);
router.put('/profile/avatar', protect, avatarUploadHandler, updateUserAvatar);
router.put('/change-password', protect, changePassword);
router.get('/export-data', protect, exportData);
router.get('/settings', protect, getSettings);
router.put('/settings', protect, updateSettings);
router.post('/:userId/follow', protect, toggleFollow);
router.get('/:userId/followers', protect, getFollowers);
router.get('/:userId/following', protect, getFollowing);
router.get('/reputation-score', protect, getReputationScore);
router.get('/leaderboard/top-users', getTopUsers);
router.post('/saved-posts/:postId', protect, savePost);
router.delete('/saved-posts/:postId', protect, unsavePost);
router.get('/saved-posts', protect, getSavedPosts);
router.post('/saved-jobs/:jobId', protect, saveJob);
router.delete('/saved-jobs/:jobId', protect, unsaveJob);
router.get('/saved-jobs', protect, getSavedJobs);
router.get('/:userId', protect, getUserById);

module.exports = router;
