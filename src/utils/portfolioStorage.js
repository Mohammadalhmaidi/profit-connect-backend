const fs = require('fs');
const path = require('path');

const uploadsRoot = path.join(__dirname, '../../uploads');
const portfolioDir = path.join(uploadsRoot, 'portfolio');

fs.mkdirSync(portfolioDir, { recursive: true });

const allowedPortfolioMimeTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/jpg',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
];

const buildPortfolioMediaUrl = (req, filename) => {
  if (!filename) return null;
  return `${req.protocol}://${req.get('host')}/uploads/portfolio/${filename}`;
};

const isLocalPortfolioMedia = (mediaUrl) => {
  return typeof mediaUrl === 'string' && mediaUrl.includes('/uploads/portfolio/');
};

const extractPortfolioFilename = (mediaUrl) => {
  if (!isLocalPortfolioMedia(mediaUrl)) return null;
  return mediaUrl.split('/uploads/portfolio/').pop();
};

const deletePortfolioMedia = async (mediaUrl) => {
  const filename = extractPortfolioFilename(mediaUrl);
  if (!filename) return;

  const filePath = path.join(portfolioDir, filename);
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
};

module.exports = {
  portfolioDir,
  allowedPortfolioMimeTypes,
  buildPortfolioMediaUrl,
  deletePortfolioMedia,
  isLocalPortfolioMedia,
};
