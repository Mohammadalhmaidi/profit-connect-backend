const fs = require('fs');
const path = require('path');

const uploadsRoot = path.join(__dirname, '../../uploads');
const companyMediaDir = path.join(uploadsRoot, 'company-media');

fs.mkdirSync(companyMediaDir, { recursive: true });

const allowedImageMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

const buildCompanyMediaUrl = (req, filename) => {
  if (!filename) return null;
  return `uploads/company-media/${filename}`;
};

const isLocalCompanyMedia = (mediaUrl) => {
  return typeof mediaUrl === 'string' && mediaUrl.includes('/uploads/company-media/');
};

const extractCompanyMediaFilename = (mediaUrl) => {
  if (!isLocalCompanyMedia(mediaUrl)) return null;
  return mediaUrl.split('/uploads/company-media/').pop();
};

const deleteCompanyMediaFile = async (mediaUrl) => {
  const filename = extractCompanyMediaFilename(mediaUrl);
  if (!filename) return;

  const filePath = path.join(companyMediaDir, filename);
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
};

module.exports = {
  companyMediaDir,
  allowedImageMimeTypes,
  buildCompanyMediaUrl,
  deleteCompanyMediaFile,
};
