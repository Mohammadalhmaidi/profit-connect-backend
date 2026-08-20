// اختبارات الشركات: إنشاء، جلب، تحديث، حذف، متابعة، إحصاءات
const { connectTestDb, clearDb, disconnectTestDb } = require('./helpers/db');
const { api, signup, authHeader } = require('./helpers/api');

describe('Company', () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearDb();
  });

  const companyPayload = () => ({
    name: 'شركة التقنية',
    description: 'شركة تطوير برمجيات',
    industry: 'Tech',
    companySize: '11-50',
    foundedYear: 2020,
    website: 'https://tech.example.com',
    location: { country: 'مصر', city: 'القاهرة', street: 'شارع 1' },
  });

  test('إنشاء شركة: باحث عن عمل مرفوض (403) وصاحب عمل ناجح (201)', async () => {
    const seeker = await signup();
    const denied = await api()
      .post('/api/companies')
      .set(authHeader(seeker.token))
      .send(companyPayload());
    expect(denied.status).toBe(403);

    const employer = await signup({}, 'Employer');
    const ok = await api()
      .post('/api/companies')
      .set(authHeader(employer.token))
      .send(companyPayload());
    expect(ok.status).toBe(201);
    expect(ok.body.success).toBe(true);
    expect(ok.body.data.name).toBe('شركة التقنية');
    expect(String(ok.body.data.owner)).toBe(employer.userId);
  });

  test('إنشاء شركة بدون اسم يُرفض (400)', async () => {
    const employer = await signup({}, 'Employer');
    const res = await api()
      .post('/api/companies')
      .set(authHeader(employer.token))
      .send({ description: 'بدون اسم' });
    expect(res.status).toBe(400);
  });

  test('جلب قائمة الشركات يعيد الشركات الموجودة', async () => {
    const employer = await signup({}, 'Employer');
    await api()
      .post('/api/companies')
      .set(authHeader(employer.token))
      .send(companyPayload());

    const res = await api()
      .get('/api/companies?status=Pending')
      .set(authHeader(employer.token));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const list = res.body.data || res.body.companies || [];
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(1);
  });

  test('جلب شركة بمعرف غير موجود يعيد 404', async () => {
    const { token } = await signup();
    const res = await api()
      .get('/api/companies/507f1f77bcf86cd799439011')
      .set(authHeader(token));
    expect(res.status).toBe(404);
  });

  test('تحديث الشركة: المالك فقط (200) والغير مالك (403)', async () => {
    const owner = await signup({}, 'Employer');
    const created = await api()
      .post('/api/companies')
      .set(authHeader(owner.token))
      .send(companyPayload());
    const companyId = created.body.data._id;

    const other = await signup();
    const denied = await api()
      .put(`/api/companies/${companyId}`)
      .set(authHeader(other.token))
      .send({ name: 'اختراق' });
    expect(denied.status).toBe(403);

    const ok = await api()
      .put(`/api/companies/${companyId}`)
      .set(authHeader(owner.token))
      .send({ name: 'الاسم المحدث' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.name).toBe('الاسم المحدث');
  });

  test('متابعة وإلغاء متابعة الشركة (toggle)', async () => {
    const employer = await signup({}, 'Employer');
    const created = await api()
      .post('/api/companies')
      .set(authHeader(employer.token))
      .send(companyPayload());
    const companyId = created.body.data._id;

    const follower = await signup();

    const follow = await api()
      .post(`/api/companies/${companyId}/follow`)
      .set(authHeader(follower.token));
    expect(follow.status).toBe(200);
    expect(follow.body.isFollowing).toBe(true);

    const unfollow = await api()
      .post(`/api/companies/${companyId}/follow`)
      .set(authHeader(follower.token));
    expect(unfollow.status).toBe(200);
    expect(unfollow.body.isFollowing).toBe(false);
  });

  test('متابعو الشركة يعيدون قائمة المستخدمين', async () => {
    const employer = await signup({}, 'Employer');
    const created = await api()
      .post('/api/companies')
      .set(authHeader(employer.token))
      .send(companyPayload());
    const companyId = created.body.data._id;

    const follower = await signup();
    await api()
      .post(`/api/companies/${companyId}/follow`)
      .set(authHeader(follower.token));

    const res = await api()
      .get(`/api/companies/${companyId}/followers`)
      .set(authHeader(follower.token));
    expect(res.status).toBe(200);
    const followers = res.body.followers || res.body.data || [];
    expect(Array.isArray(followers)).toBe(true);
    expect(followers.length).toBeGreaterThanOrEqual(1);
  });

  test('إحصاءات الشركة تعيد الأرقام الأساسية', async () => {
    const employer = await signup({}, 'Employer');
    const created = await api()
      .post('/api/companies')
      .set(authHeader(employer.token))
      .send(companyPayload());
    const companyId = created.body.data._id;

    const res = await api()
      .get(`/api/companies/${companyId}/stats`)
      .set(authHeader(employer.token));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('حذف الشركة: المالك (200) والغير مالك (403)', async () => {
    const owner = await signup({}, 'Employer');
    const created = await api()
      .post('/api/companies')
      .set(authHeader(owner.token))
      .send(companyPayload());
    const companyId = created.body.data._id;

    const other = await signup();
    const denied = await api()
      .delete(`/api/companies/${companyId}`)
      .set(authHeader(other.token));
    expect(denied.status).toBe(403);

    const ok = await api()
      .delete(`/api/companies/${companyId}`)
      .set(authHeader(owner.token));
    expect(ok.status).toBe(200);
    expect(ok.body.success).toBe(true);
  });
});