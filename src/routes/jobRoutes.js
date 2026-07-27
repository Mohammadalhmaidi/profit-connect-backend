const express = require('express');
const router = express.Router();

const { 
  createJob, 
  getJobs, 
  getJobById,
  applyForJob,
  getJobApplicants,
  updateApplicationStatus,
  getMyApplications,
  updateJobStatus
} = require('../controllers/jobController');

const { protect } = require('../middleware/authMiddleware');
const { uploadResume } = require('../middleware/uploadMiddleware');

router.get('/', getJobs); 
router.get('/my-applications', protect, getMyApplications);
router.get('/:id', getJobById);
router.post('/', protect, createJob); 
router.post('/:id/apply', protect, uploadResume.single('resume'), applyForJob);
router.get('/:id/applicants', protect, getJobApplicants);
router.put('/:id/status', protect, updateJobStatus);
router.put('/applications/:applicationId/status', protect, updateApplicationStatus);


module.exports = router;