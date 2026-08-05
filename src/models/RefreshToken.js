const mongoose = require('mongoose');

// توكن تجديد الجلسة (Refresh Token) — يُخزَّن بشكل مجزَّأ (Hash) فقط
// ويُدعم التناوب: كل تجديد يُبطل القديم ويُصدر جديداً
const refreshTokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    tokenHash: {
      // SHA-256 للتوكن — لا يُخزَّن التوكن الخام أبداً
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    replacedBy: {
      // tokenHash للتوكن الجديد عند التناوب (Rotation)
      type: String,
      default: null,
    },
    userAgent: String,
    ip: String,
  },
  { timestamps: true }
);

refreshTokenSchema.index({ user: 1 });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
