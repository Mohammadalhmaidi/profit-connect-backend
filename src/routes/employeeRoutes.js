const express = require('express');
const router = express.Router();

const {
  getMyCompany,
  getCompanyJobs,
  createJob,
  getJobApplicants,
  updateApplicationStatus,
  getCompanyStats
} = require('../controllers/employeeController');

const { protect } = require('../middleware/authMiddleware');

// تطبيق الحماية على جميع المسارات
router.use(protect);

// مسارات لوحة تحكم الموظف
router.get('/my-company', getMyCompany);
router.get('/jobs', getCompanyJobs);
router.post('/jobs', createJob);
router.get('/jobs/:id/applicants', getJobApplicants);
router.put('/jobs/applications/:applicationId/status', updateApplicationStatus);
router.get('/stats', getCompanyStats);

module.exports = router;
