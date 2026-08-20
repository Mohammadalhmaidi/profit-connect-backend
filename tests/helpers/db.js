// إعداد قاعدة بيانات الاختبار: تستخدم MongoDB المحلي بقاعدة مخصصة للاختبارات
// كي لا تمس بيانات التطوير الفعلية.
const mongoose = require('mongoose');

const TEST_URI = process.env.TEST_DATABASE_URL || 'mongodb://localhost:27017/profitconnect_test';

const connectTestDb = async () => {
  await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 5000 });
};

// مسح كل المجموعات قبل كل اختبار لعزل الحالات
const clearDb = async () => {
  const collections = await mongoose.connection.db.collections();
  for (const collection of collections) {
    await collection.deleteMany({});
  }
};

const disconnectTestDb = async () => {
  await mongoose.disconnect();
};

module.exports = { TEST_URI, connectTestDb, clearDb, disconnectTestDb };