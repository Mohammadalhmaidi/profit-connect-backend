const express = require('express');
const router = express.Router();

const { 
  createCompany, 
  getCompanies, 
  getCompanyById,
  toggleFollowCompany, 
  addCompanyAdmin, 
  updateCompany, 
  deleteCompany, 
  getCompanyFollowers, 
  addRating, 
  getCompanyRatings, 
  deleteRating,
  getCompanyStats
} = require('../controllers/companyController');

const {
  addEmployee,
  getCompanyEmployees,
  removeEmployee,
  updateEmployee
} = require('../controllers/employeeController');

const { protect, employerOnly } = require('../middleware/authMiddleware');
const { uploadCompanyDocs, uploadCompanyMedia } = require('../middleware/uploadMiddleware');

// تطبيق الحماية
router.use(protect);

// مسارات الشركات
router.route('/')
  .post(protect, employerOnly, uploadCompanyDocs.array('documents', 5), createCompany)
  .get(getCompanies);

router.route('/:id')
  .get(getCompanyById)
  .put(uploadCompanyMedia.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'coverPhoto', maxCount: 1 }
  ]), updateCompany)
  .delete(deleteCompany);

router.get('/:id/stats', getCompanyStats);
router.get('/:id/followers', getCompanyFollowers);
router.post('/:id/follow', toggleFollowCompany);
router.post('/:id/admins', addCompanyAdmin);
router.route('/:id/ratings')
  .post(addRating)
  .get(getCompanyRatings)
  .delete(deleteRating);

// مسارات إدارة الموظفين
router.route('/:id/employees')
  .post(addEmployee)
  .get(getCompanyEmployees);

router.route('/:id/employees/:employeeId')
  .put(updateEmployee)
  .delete(removeEmployee);

module.exports = router;