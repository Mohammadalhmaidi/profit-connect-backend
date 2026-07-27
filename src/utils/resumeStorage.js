const fs = require('fs');
const path = require('path');

const uploadsRoot = path.join(__dirname, '../../uploads');
const resumesDir = path.join(uploadsRoot, 'resumes');

fs.mkdirSync(resumesDir, { recursive: true });

const allowedResumeMimeTypes = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

const buildResumeUrl = (req, filename) => {
  if (!filename) return null;
  return `${req.protocol}://${req.get('host')}/uploads/resumes/${filename}`;
};

const isLocalResume = (url) => {
  return typeof url === 'string' && url.includes('/uploads/resumes/');
};

const extractResumeFilename = (url) => {
  if (!isLocalResume(url)) return null;
  return url.split('/uploads/resumes/').pop();
};

const deleteResumeFile = async (resumeUrl) => {
  const filename = extractResumeFilename(resumeUrl);
  if (!filename) return;

  const filePath = path.join(resumesDir, filename);
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
};

module.exports = {
  resumesDir,
  allowedResumeMimeTypes,
  buildResumeUrl,
  deleteResumeFile,
};
