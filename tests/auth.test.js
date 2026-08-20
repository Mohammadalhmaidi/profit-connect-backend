// اختبارات المصادقة: تسجيل، دخول، جلب المستخدم الحالي، حماية المسارات
const { connectTestDb, clearDb, disconnectTestDb } = require('./helpers/db');
const { api, signup, authHeader } = require('./helpers/api');

describe('Auth', () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearDb();
  });

  test('signup ينشئ حساباً ويعيد توكن وصول وريفرش', async () => {
    const res = await api().post('/api/auth/signup').send({
      email: 'new_user@test.com',
      password: 'Password123',
      role: 'JobSeeker',
      firstName: 'سارة',
      lastName: 'خالد',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.id).toBeTruthy();
    expect(res.body.user.profile.firstName).toBe('سارة');
  });

  test('signup يرفض البريد المكرر', async () => {
    const payload = {
      email: 'duplicate@test.com',
      password: 'Password123',
      role: 'JobSeeker',
      firstName: 'أ',
      lastName: 'ب',
    };
    await api().post('/api/auth/signup').send(payload);
    const res = await api().post('/api/auth/signup').send(payload);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('login ينجح بكلمة مرور صحيحة ويفشل بالخاطئة', async () => {
    const { payload } = await signup();

    const ok = await api().post('/api/auth/login').send({
      email: payload.email,
      password: 'Password123',
    });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();
    expect(ok.body.user.email).toBe(payload.email);

    const bad = await api().post('/api/auth/login').send({
      email: payload.email,
      password: 'wrong-password',
    });
    expect(bad.status).toBe(401);
  });

  test('me يعيد بيانات المستخدم الحالي مع توكن صالح', async () => {
    const { token } = await signup();

    const res = await api().get('/api/auth/me').set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user).toBeDefined();
  });

  test('المسارات المحمية ترفض الطلب بدون توكن', async () => {
    const res = await api().get('/api/auth/me');

    expect(res.status).toBe(401);
  });

  test('المسارات المحمية ترفض الريفرش توكن كتوكن وصول', async () => {
    const { payload } = await signup();
    const login = await api().post('/api/auth/login').send({
      email: payload.email,
      password: 'Password123',
    });

    const res = await api()
      .get('/api/auth/me')
      .set(authHeader(login.body.refreshToken));

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('signup يرفض كلمة المرور الضعيفة (أقل من 8 أو بلا حرف كبير أو رقم)', async () => {
    const base = {
      email: 'weak@test.com',
      role: 'JobSeeker',
      firstName: 'أ',
      lastName: 'ب',
    };

    const tooShort = await api().post('/api/auth/signup').send({ ...base, password: 'Ab1' });
    expect(tooShort.status).toBe(400);

    const noUpper = await api().post('/api/auth/signup').send({ ...base, password: 'abcdefgh1' });
    expect(noUpper.status).toBe(400);

    const noDigit = await api().post('/api/auth/signup').send({ ...base, password: 'Abcdefgh' });
    expect(noDigit.status).toBe(400);

    const ok = await api().post('/api/auth/signup').send({ ...base, password: 'Abcdefgh1' });
    expect(ok.status).toBe(201);
  });

  test('authLimiter يرد 429 بعد تجاوز 20 محاولة دخول', async () => {
    // تفعيل الـ limiter مؤقتاً في بيئة الاختبار ثم إعادته
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      let lastStatus = 0;
      for (let i = 0; i < 22; i++) {
        const res = await api().post('/api/auth/login').send({
          email: `limiter_${i}@test.com`,
          password: 'WrongPassword1',
        });
        lastStatus = res.status;
      }
      expect(lastStatus).toBe(429);
      expect((await api().post('/api/auth/login').send({})).body.success).toBe(false);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });

  test('signupLimiter يرد 429 بعد تجاوز 10 تسجيلات', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      let lastStatus = 0;
      for (let i = 0; i < 12; i++) {
        const res = await api().post('/api/auth/signup').send({
          email: `signup_limit_${i}@test.com`,
          password: 'Password123',
          role: 'JobSeeker',
          firstName: 'أ',
          lastName: 'ب',
        });
        lastStatus = res.status;
      }
      expect(lastStatus).toBe(429);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });
});