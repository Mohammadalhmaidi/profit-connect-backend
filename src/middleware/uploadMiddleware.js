const path = require('path');
const multer = require('multer');
const { avatarsDir, allowedMimeTypes: avatarMimeTypes } = require('../utils/avatarStorage');
const { postsDir, videosDir, allowedImageMimeTypes, allowedVideoMimeTypes } = require('../utils/postImageStorage');
const { companyDocsDir, allowedDocMimeTypes } = require('../utils/companyStorage');
const { companyMediaDir, allowedImageMimeTypes: companyMediaMimeTypes } = require('../utils/companyMedia');
const { resumesDir, allowedResumeMimeTypes } = require('../utils/resumeStorage');

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, avatarsDir);
  },
  filename: (req, file, cb) => {
    const fileExtension = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `avatar-${req.user ? req.user._id : 'new'}-${uniqueSuffix}${fileExtension}`);
  },
});

const avatarFileFilter = (req, file, cb) => {
  if (!avatarMimeTypes.includes(file.mimetype)) {
    return cb(new Error('نوع الملف غير مدعوم. الرجاء رفع صورة بصيغة JPG أو PNG أو WEBP'));
  }
  cb(null, true);
};

const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: avatarFileFilter,
});

const postImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, postsDir);
  },
  filename: (req, file, cb) => {
    const fileExtension = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `post-${req.user ? req.user._id : 'new'}-${uniqueSuffix}${fileExtension}`);
  },
});

const postImageFileFilter = (req, file, cb) => {
  if (!allowedImageMimeTypes.includes(file.mimetype)) {
    return cb(new Error('نوع الملف غير مدعوم. الرجاء رفع صورة بصيغة JPG أو PNG أو WEBP أو GIF'));
  }
  cb(null, true);
};

const uploadPostImage = multer({
  storage: postImageStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: postImageFileFilter,
});

const postVideoFileFilter = (req, file, cb) => {
  if (!allowedVideoMimeTypes.includes(file.mimetype)) {
    return cb(new Error('نوع الملف غير مدعوم. الرجاء رفع فيديو بصيغة MP4 أو WebM أو MOV أو AVI'));
  }
  cb(null, true);
};

// combined media upload — routes image to postsDir, video to videosDir
const postMediaStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'video') {
      cb(null, videosDir);
    } else {
      cb(null, postsDir);
    }
  },
  filename: (req, file, cb) => {
    const fileExtension = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const prefix = file.fieldname === 'video' ? 'video' : 'post';
    cb(null, `${prefix}-${req.user ? req.user._id : 'new'}-${uniqueSuffix}${fileExtension}`);
  },
});

const postMediaFileFilter = (req, file, cb) => {
  if (file.fieldname === 'video') {
    if (!allowedVideoMimeTypes.includes(file.mimetype)) {
      return cb(new Error('نوع الملف غير مدعوم. الرجاء رفع فيديو بصيغة MP4 أو WebM أو MOV أو AVI'));
    }
  } else {
    if (!allowedImageMimeTypes.includes(file.mimetype)) {
      return cb(new Error('نوع الملف غير مدعوم. الرجاء رفع صورة بصيغة JPG أو PNG أو WEBP أو GIF'));
    }
  }
  cb(null, true);
};

const uploadPostMedia = multer({
  storage: postMediaStorage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: postMediaFileFilter,
});

const companyDocStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, companyDocsDir),
  filename: (req, file, cb) => {
    const fileExtension = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `doc-${req.user ? req.user._id : 'new'}-${uniqueSuffix}${fileExtension}`);
  },
});

const companyDocFileFilter = (req, file, cb) => {
  if (!allowedDocMimeTypes.includes(file.mimetype)) {
    return cb(new Error('نوع الملف غير مدعوم. الرجاء رفع صورة (JPG/PNG/WEBP) أو ملف PDF'));
  }
  cb(null, true);
};

const uploadCompanyDocs = multer({
  storage: companyDocStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: companyDocFileFilter,
});

// ==========================================
// Company Media (Logo + Cover Photo)
// ==========================================
const companyMediaStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, companyMediaDir),
  filename: (req, file, cb) => {
    const fileExtension = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const prefix = file.fieldname === 'logo' ? 'logo' : 'cover';
    cb(null, `${prefix}-${req.user ? req.user._id : 'new'}-${uniqueSuffix}${fileExtension}`);
  },
});

const companyMediaFileFilter = (req, file, cb) => {
  if (!companyMediaMimeTypes.includes(file.mimetype)) {
    return cb(new Error('نوع الملف غير مدعوم. الرجاء رفع صورة بصيغة JPG أو PNG أو WEBP'));
  }
  cb(null, true);
};

const uploadCompanyMedia = multer({
  storage: companyMediaStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: companyMediaFileFilter,
});

// ==========================================
// Resume / CV Upload
// ==========================================
const resumeStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, resumesDir),
  filename: (req, file, cb) => {
    const fileExtension = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `resume-${req.user._id}-${uniqueSuffix}${fileExtension}`);
  },
});

const resumeFileFilter = (req, file, cb) => {
  if (!allowedResumeMimeTypes.includes(file.mimetype)) {
    return cb(new Error('نوع الملف غير مدعوم. الرجاء رفع السيرة الذاتية بصيغة PDF أو Word'));
  }
  cb(null, true);
};

const uploadResume = multer({
  storage: resumeStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: resumeFileFilter,
});

module.exports = {
  uploadAvatar,
  uploadPostImage,
  uploadPostMedia,
  uploadCompanyDocs,
  uploadCompanyMedia,
  uploadResume,
};
