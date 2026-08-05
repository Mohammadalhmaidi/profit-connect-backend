const mongoose = require('mongoose');

// إعدادات عامة للمنصة (مثل نسبة عمولة المنصة)
const settingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Setting', settingSchema);
