const fs = require('fs');
const path = require('path');

const uploadsRoot = path.join(__dirname, '../../uploads');
const avatarsDir = path.join(uploadsRoot, 'avatars');

fs.mkdirSync(avatarsDir, { recursive: true });

const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

const buildAvatarUrl = (req, filename) => {
  if (!filename) {
    return null;
  }

  return `uploads/avatars/${filename}`;
};

const isLocalAvatar = (avatarUrl) => {
  return typeof avatarUrl === 'string' && avatarUrl.includes('/uploads/avatars/');
};

const extractAvatarFilename = (avatarUrl) => {
  if (!isLocalAvatar(avatarUrl)) {
    return null;
  }

  return avatarUrl.split('/uploads/avatars/').pop();
};

const deleteAvatarFile = async (avatarUrl) => {
  const filename = extractAvatarFilename(avatarUrl);

  if (!filename) {
    return;
  }

  const filePath = path.join(avatarsDir, filename);

  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
};

module.exports = {
  uploadsRoot,
  avatarsDir,
  allowedMimeTypes,
  buildAvatarUrl,
  deleteAvatarFile,
};
