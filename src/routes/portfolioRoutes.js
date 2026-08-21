const express = require('express');
const { sanitizeError } = require('../utils/sanitizeError');
const router = express.Router();

const {
  createItem,
  getMyItems,
  getUserItems,
  getItemById,
  updateItem,
  deleteItem,
  toggleLike,
  createCollection,
  getMyCollections,
  getUserCollections,
  getCollectionById,
  updateCollection,
  deleteCollection,
  addItemToCollection,
  removeItemFromCollection,
} = require('../controllers/portfolioController');

const { protect } = require('../middleware/authMiddleware');
const { uploadPortfolioMedia } = require('../middleware/uploadMiddleware');

const portfolioMediaUpload = (req, res, next) => {
  uploadPortfolioMedia.array('media', 12)(req, res, (error) => {
    if (error) {
      return res.status(400).json({ success: false, message: sanitizeError(error) });
    }
    next();
  });
};

// جميع المسارات محمية (يتطلب تسجيل الدخول)
router.use(protect);

// ===== المجموعات (Collections) =====
router.get('/collections', getMyCollections);
router.post('/collections', createCollection);
router.route('/collections/:id')
  .get(getCollectionById)
  .put(updateCollection)
  .delete(deleteCollection);
router.post('/collections/:id/items/:itemId', addItemToCollection);
router.delete('/collections/:id/items/:itemId', removeItemFromCollection);

// ===== معارض المستخدمين العامة =====
router.get('/users/:userId/items', getUserItems);
router.get('/users/:userId/collections', getUserCollections);

// ===== الأعمال (Items) =====
router.get('/items', getMyItems);
router.post('/items', portfolioMediaUpload, createItem);
router.get('/items/:id', getItemById);
router.put('/items/:id', portfolioMediaUpload, updateItem);
router.delete('/items/:id', deleteItem);
router.post('/items/:id/like', toggleLike);

module.exports = router;
