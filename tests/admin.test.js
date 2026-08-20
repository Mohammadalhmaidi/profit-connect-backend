// اختبارات لوحة الأدمن: إحصائيات وقائمة المستخدمين وحماية الأدمن
const User = require('../src/models/User');
const { connectTestDb, clearDb, disconnectTestDb } = require('./helpers/db');
const { api, signup, authHeader } = require('./helpers/api');

describe('Admin', () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearDb();
  });

  const createAdmin = async () => {
    await User.create({
      email: 'admin@test.com',
      password: 'Password123',
      role: 'Admin',
      profile: { firstName: 'Admin', lastName: 'Root' },
    });
    const login = await api().post('/api/auth/login').send({
      email: 'admin@test.com',
      password: 'Password123',
    });
    expect(login.status).toBe(200);
    return login.body.token;
  };

  test('مستخدم عادي لا يصل إلى لوحة الأدمن (403)', async () => {
    const { token } = await signup();
    const res = await api().get('/api/admin/stats').set(authHeader(token));
    expect(res.status).toBe(403);
  });

  test('الأدمن يجلب الإحصائيات وقائمة المستخدمين', async () => {
    const adminToken = await createAdmin();
    await signup();

    const stats = await api().get('/api/admin/stats').set(authHeader(adminToken));
    expect(stats.status).toBe(200);
    expect(stats.body.success).toBe(true);
    expect(stats.body.data).toBeDefined();
    expect(stats.body.data.users).toBeGreaterThanOrEqual(1);

    const users = await api().get('/api/admin/users').set(authHeader(adminToken));
    expect(users.status).toBe(200);
    const list = users.body.data || users.body.users || [];
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(1);
  });

  test('تحديث حالة مستخدم وتغيير دوره من الأدمن', async () => {
    const adminToken = await createAdmin();
    const { userId } = await signup();

    const setStatus = await api()
      .put(`/api/admin/users/${userId}/status`)
      .set(authHeader(adminToken))
      .send({ status: 'active' });
    expect(setStatus.status).toBe(200);
    expect(setStatus.body.success).toBe(true);

    const setRole = await api()
      .put(`/api/admin/users/${userId}/role`)
      .set(authHeader(adminToken))
      .send({ role: 'Employer' });
    expect(setRole.status).toBe(200);

    const updated = await User.findById(userId);
    expect(updated.role).toBe('Employer');
  });
});
