// اختبارات تسجيل الدخول عبر Google (OAuth): تحقق الرمز وإنشاء/تسجيل الدخول
const { connectTestDb, clearDb, disconnectTestDb } = require('./helpers/db');
const { api } = require('./helpers/api');

describe('OAuth Google', () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearDb();
  });

  const mockTokenInfo = (overrides = {}) => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        email: 'google_user@test.com',
        email_verified: 'true',
        given_name: 'Google',
        family_name: 'User',
        ...overrides,
      }),
    });
    return () => {
      global.fetch = originalFetch;
    };
  };

  test('تسجيل الدخول بجوجل ينشئ مستخدمًا ويعيد التوكن', async () => {
    const restore = mockTokenInfo();

    try {
      const res = await api().post('/api/oauth/google').send({
        idToken: 'fake-google-token',
        email: 'google_user@test.com',
        firstName: 'Google',
        lastName: 'User',
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeTruthy();
      expect(res.body.refreshToken).toBeTruthy();
      expect(res.body.user.email).toBe('google_user@test.com');
    } finally {
      restore();
    }
  });

  test('بدون idToken (400)', async () => {
    const res = await api().post('/api/oauth/google').send({ email: 'x@y.com' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('رمز غير صالح (401)', async () => {
    const restore = mockTokenInfo();
    try {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 });

      const res = await api().post('/api/oauth/google').send({
        idToken: 'bad-token',
      });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      global.fetch = originalFetch;
    } finally {
      restore();
    }
  });

  test('تسجيل الدخول مرة أخرى لمستخدم موجود ينجح', async () => {
    const restore = mockTokenInfo();

    try {
      const first = await api().post('/api/oauth/google').send({
        idToken: 't1',
        email: 'google_user@test.com',
      });
      expect(first.status).toBe(200);

      const second = await api().post('/api/oauth/google').send({
        idToken: 't2',
        email: 'google_user@test.com',
      });
      expect(second.status).toBe(200);
      expect(second.body.success).toBe(true);
    } finally {
      restore();
    }
  });
});
