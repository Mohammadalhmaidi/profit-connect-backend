
const dotenv = require('dotenv');
dotenv.config(); // <-- يجب تحميل .env قبل أي شيء يقرأ process.env

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const logger = require('./utils/logger');
const { sanitizeError } = require('./utils/sanitizeError');

// استدعاء دالة الاتصال بقاعدة البيانات
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const postRoutes = require('./routes/postRoutes');
const companyRoutes = require('./routes/companyRoutes');
const adminRoutes = require('./routes/adminRoutes');
const jobRoutes = require('./routes/jobRoutes');
const salaryRoutes = require('./routes/salaryRoutes');
const messageRoutes = require('./routes/messageRoutes');
const followRoutes = require('./routes/followRoutes'); // <-- إضافة مسارات المتابعة
const translateRoutes = require('./routes/translateRoutes');
const projectRoutes = require('./routes/projectRoutes');
const improveRoutes = require('./routes/improveRoutes');
const networkRoutes = require('./routes/networkRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const walletRoutes = require('./routes/walletRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const oauthRoutes = require('./routes/oauthRoutes');
const portfolioRoutes = require('./routes/portfolioRoutes');

// تهيئة تطبيق Express
const app = express();

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map((o) => o.trim());

const corsOptions = {
  origin: (origin, callback) => {
    // السماح للطلبات بدون أصل (Postman، تطبيقات الجوال الأصلية، سيرفرات أخرى)
    // أو ذات الأصل "null" (WebView/الهجينة وتطبيقات file://)
    // أو الأصول المسموحة فقط في CLIENT_URL
    if (!origin || origin === 'null' || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('غير مسموح بطلب من هذا الأصل (CORS)'));
    }
  },
  credentials: true,
};

// --- إعدادات الـ Middlewares الأساسية ---
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(cors(corsOptions));
app.use(express.json());
app.use('/uploads', cors(corsOptions), express.static(path.join(__dirname, '../uploads')));
app.get('/default-avatar.png', cors(corsOptions), (req, res) => {
  res.sendFile(path.join(__dirname, '../uploads/default-avatar.png'));
});
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/users', followRoutes); // <-- تسجيل مسارات المتابعة
app.use('/api/posts', postRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/salaries', salaryRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/translate', translateRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/improve', improveRoutes);
app.use('/api/network', networkRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/oauth', oauthRoutes);
app.use('/api/portfolio', portfolioRoutes);

// تسجيل كل الطلبات (IP، الأسلوب، الرابط، الحالة، الوقت، المتصفح، المرجع)
// يُكتب في ملف logs/access.log ويُطبع في موجه الأوامر
app.use(logger.accessLog);
app.use(logger.accessLogConsole);
app.use(logger.accessLogConsoleErrors);

// مسار تجريبي للتأكد من عمل السيرفر
app.get('/', (req, res) => {
  res.send('ProfitConnect API is running... 🚀');
});

// مسار غير موجود
app.use((req, res) => {
  logger.info(`404 NOT FOUND: ${req.method} ${req.originalUrl} IP=${req.ip}`);
  res.status(404).json({ message: 'المسار غير موجود' });
});

// معالج الأخطاء العام - يسجل أي خطأ في logs/errors.log
app.use((err, req, res, next) => {
  const safeMessage = sanitizeError(err);
  logger.error(
    `UNHANDLED ERROR on ${req.method} ${req.originalUrl} IP=${req.ip}: ${safeMessage}`,
  );
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ success: false, message: safeMessage });
});

// تحديد المنفذ من المتغيرات أو استخدام 3001 كاحتياطي
const PORT = process.env.PORT || 5000;

// تشغيل السيرفر — عند التشغيل المباشر فقط (لا عند الاستيراد في الاختبارات)
if (require.main === module) {
  connectDB();
  app.listen(PORT, () => {
    console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  });
}

module.exports = app;
