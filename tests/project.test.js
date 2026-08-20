// اختبارات المشاريع: إنشاء، جلب، إشعارات، عروض، إدارة الفريق
const { connectTestDb, clearDb, disconnectTestDb } = require('./helpers/db');
const { api, signup, authHeader } = require('./helpers/api');

describe('Project', () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearDb();
  });

  const projectPayload = () => ({
    title: 'بناء تطبيق جوال',
    description: 'تطبيق إدارة مهام',
    category: 'Mobile',
    skills: ['Flutter', 'Firebase'],
    budget: 5000,
    deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });

  test('إنشاء مشروع (201) وجلبه بالمعرف', async () => {
    const { token } = await signup();

    const created = await api()
      .post('/api/projects')
      .set(authHeader(token))
      .send(projectPayload());
    expect(created.status).toBe(201);
    expect(created.body.success).toBe(true);
    expect(created.body.data.title).toBe('بناء تطبيق جوال');

    const id = created.body.data._id;
    const fetched = await api().get(`/api/projects/${id}`).set(authHeader(token));
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.title).toBe('بناء تطبيق جوال');
  });

  test('إنشاء مشروع بدون عنوان يُرفض (400)', async () => {
    const { token } = await signup();
    const res = await api()
      .post('/api/projects')
      .set(authHeader(token))
      .send({ description: 'بلا عنوان', category: 'X' });
    expect(res.status).toBe(400);
  });

  test('إشعارات المشاريع: قائمة + قراءة الكل + تمييز المقروء', async () => {
    const { token, userId } = await signup();

    // إنشاء مشروع يولد إشعارًا تلقائيًا
    await api()
      .post('/api/projects')
      .set(authHeader(token))
      .send(projectPayload());

    const list = await api()
      .get('/api/projects/notifications')
      .set(authHeader(token));
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.data || list.body.notifications)).toBe(true);

    const recent = await api()
      .get('/api/projects/notifications/recent')
      .set(authHeader(token));
    expect(recent.status).toBe(200);

    const all = await api()
      .put('/api/projects/notifications/read-all')
      .set(authHeader(token));
    expect(all.status).toBe(200);
    expect(all.body.success).toBe(true);

    const list2 = await api()
      .get('/api/projects/notifications')
      .set(authHeader(token));
    const notifications = list2.body.data || list2.body.notifications || [];
    const unread = notifications.filter((n) => !n.read);
    expect(unread.length).toBe(0);
  });

  test('تقرير مشروع (overview) يعيد بيانات العملية', async () => {
    const { token } = await signup();
    const created = await api()
      .post('/api/projects')
      .set(authHeader(token))
      .send(projectPayload());
    const id = created.body.data._id;

    const res = await api()
      .get(`/api/projects/${id}/overview`)
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('إدارة المشروع: تعديل الحالة وتحديثه', async () => {
    const { token } = await signup();
    const created = await api()
      .post('/api/projects')
      .set(authHeader(token))
      .send(projectPayload());
    const id = created.body.data._id;

    const res = await api()
      .put(`/api/projects/${id}/manage`)
      .set(authHeader(token))
      .send({ title: 'عنوان محدث' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('الفريق: إضافة عضو وحذفه وقراءة القائمة', async () => {
    const owner = await signup();
    const member = await signup();
    const created = await api()
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send(projectPayload());
    const id = created.body.data._id;

    const add = await api()
      .post(`/api/projects/${id}/team`)
      .set(authHeader(owner.token))
      .send({ freelancerId: member.userId, role: 'Developer' });
    expect([200, 201]).toContain(add.status);
    expect(add.body.success).toBe(true);

    const team = await api()
      .get(`/api/projects/${id}/team`)
      .set(authHeader(owner.token));
    expect(team.status).toBe(200);
    const members = team.body.data || team.body.team || [];
    expect(members.length).toBeGreaterThanOrEqual(1);

    const memberId = members.find(
      (m) => String(m.freelancer && m.freelancer._id ? m.freelancer._id : m.freelancer) === member.userId
    );
    expect(memberId).toBeTruthy();

    const remove = await api()
      .delete(`/api/projects/${id}/team/${memberId._id || memberId}`)
      .set(authHeader(owner.token));
    expect(remove.status).toBe(200);
    expect(remove.body.success).toBe(true);
  });

  test('تسليم عرض (proposal) على مشروع وقبوله', async () => {
    const client = await signup();
    const freelancer = await signup();
    const created = await api()
      .post('/api/projects')
      .set(authHeader(client.token))
      .send(projectPayload());
    const id = created.body.data._id;

    const submit = await api()
      .post(`/api/projects/${id}/proposals`)
      .set(authHeader(freelancer.token))
      .send({ bidAmount: 4000, deliveryTime: 14, coverLetter: 'أستطيع تنفيذه' });
    expect(submit.status).toBe(201);

    const proposals = await api()
      .get(`/api/projects/${id}/proposals`)
      .set(authHeader(client.token));
    expect(proposals.status).toBe(200);
    const list = proposals.body.data || proposals.body.proposals || [];
    expect(list.length).toBeGreaterThanOrEqual(1);

    const proposalId = list[0]._id;
    const accept = await api()
      .post(`/api/projects/${id}/proposals/${proposalId}/accept`)
      .set(authHeader(client.token));
    expect(accept.status).toBe(200);
    expect(accept.body.success).toBe(true);
  });
});