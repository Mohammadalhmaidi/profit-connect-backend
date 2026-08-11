const fs = require('fs');
const path = require('path');

const uploadsRoot = path.join(__dirname, '../../uploads');
const postsDir = path.join(uploadsRoot, 'posts');
const videosDir = path.join(postsDir, 'videos');

fs.mkdirSync(postsDir, { recursive: true });
fs.mkdirSync(videosDir, { recursive: true });

// --- Images ---
const allowedImageMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'image/gif'];

const buildPostImageUrl = (req, filename) => {
  if (!filename) return null;
  return `uploads/posts/${filename}`;
};

const isLocalPostImage = (imageUrl) => {
  return typeof imageUrl === 'string' && imageUrl.includes('/uploads/posts/') && !imageUrl.includes('/uploads/posts/videos/');
};

const extractPostImageFilename = (imageUrl) => {
  if (!isLocalPostImage(imageUrl)) return null;
  return imageUrl.split('/uploads/posts/').pop();
};

const deletePostImage = async (imageUrl) => {
  const filename = extractPostImageFilename(imageUrl);
  if (!filename) return;

  const filePath = path.join(postsDir, filename);
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
};

// --- Videos ---
const allowedVideoMimeTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];

const buildPostVideoUrl = (req, filename) => {
  if (!filename) return null;
  return `uploads/posts/videos/${filename}`;
};

const isLocalPostVideo = (videoUrl) => {
  return typeof videoUrl === 'string' && videoUrl.includes('/uploads/posts/videos/');
};

const extractPostVideoFilename = (videoUrl) => {
  if (!isLocalPostVideo(videoUrl)) return null;
  return videoUrl.split('/uploads/posts/videos/').pop();
};

const deletePostVideo = async (videoUrl) => {
  const filename = extractPostVideoFilename(videoUrl);
  if (!filename) return;

  const filePath = path.join(videosDir, filename);
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
};

module.exports = {
  postsDir,
  videosDir,
  allowedImageMimeTypes,
  allowedVideoMimeTypes,
  buildPostImageUrl,
  deletePostImage,
  buildPostVideoUrl,
  deletePostVideo,
};
