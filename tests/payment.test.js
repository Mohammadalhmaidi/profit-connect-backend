// اختبارات الدفعات المالية: إيداع في الحساب الضامن، الجلب، التحرير
const { connectTestDb, clearDb, disconnectTestDb } = require('./helpers/db');
const { api, signup, authHeader } = require('./helpers/api');

describe('Payment', () => {
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
    title: 'تطوير موقع متجر',
    description: 'متجر إلكتروني متكامل',
    category: 'Web',
    skills: ['Node.js', 'React'],
    budget: 3000,
    deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });

  // تهيئة مشروع بعرض مقبول وعضو في الفريق
  const setupProjectWithAcceptedProposal = async () => {
    const client = await signup();
    const freelancer = await signup();

    const created = await api()
      .post('/api/projects')
      .set(authHeader(client.token))
      .send(projectPayload());
    const projectId = created.body.data._id;

    await api()
      .post(`/api/projects/${projectId}/team`)
      .set(authHeader(client.token))
      .send({ freelancerId: freelancer.userId, role: 'Developer' });

    await api()
      .post(`/api/projects/${projectId}/proposals`)
      .set(authHeader(freelancer.token))
      .send({ bidAmount: 2500, deliveryTime: 10, coverLetter: 'سأنفذ المشروع' });

    const proposals = await api()
      .get(`/api/projects/${projectId}/proposals`)
      .set(authHeader(client.token));
    const list = proposals.body.data || proposals.body.proposals || [];
    const proposalId = list[0]._id;

    const accept = await api()
      .post(`/api/projects/${projectId}/proposals/${proposalId}/accept`)
      .set(authHeader(client.token));
    expect(accept.status).toBe(200);

    return { client, freelancer, projectId, proposalId };
  };

  test('إيداع دفعة صالحة (201) ثم جلبها ثم تحريرها', async () => {
    const { client, freelancer, projectId, proposalId } =
      await setupProjectWithAcceptedProposal();

    const deposit = await api()
      .post('/api/payments')
      .set(authHeader(client.token))
      .send({ projectId, proposalId, amount: 2500, method: 'Visa' });
    expect(deposit.status).toBe(201);
    expect(deposit.body.success).toBe(true);
    expect(deposit.body.data.status).toBe('held');
    const paymentId = deposit.body.data._id;

    // المستلم يرى الدفعة كمدفوعة إليه
    const mine = await api()
      .get('/api/payments?direction=received')
      .set(authHeader(freelancer.token));
    expect(mine.status).toBe(200);
    const list = mine.body.data || [];
    expect(list.some((p) => String(p._id) === String(paymentId))).toBe(true);

    // تحرير الدفعة من قبل العميل
    const released = await api()
      .put(`/api/payments/${paymentId}/release`)
      .set(authHeader(client.token));
    expect(released.status).toBe(200);
    expect(released.body.success).toBe(true);

    // بعد التحرير لا يمكن تحريرها مجددًا
    const again = await api()
      .put(`/api/payments/${paymentId}/release`)
      .set(authHeader(client.token));
    expect(again.status).toBe(400);
  });

  test('إيداع بمعرّف مشروع غير صالح (400)', async () => {
    const { token } = await signup();
    const res = await api()
      .post('/api/payments')
      .set(authHeader(token))
      .send({ projectId: 'bad-id', proposalId: 'bad-id', amount: 100, method: 'Visa' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('إيداع بطريقة دفع غير صالحة (400)', async () => {
    const { client, projectId, proposalId } =
      await setupProjectWithAcceptedProposal();
    const res = await api()
      .post('/api/payments')
      .set(authHeader(client.token))
      .send({ projectId, proposalId, amount: 100, method: 'Bitcoin' });
    expect(res.status).toBe(400);
  });

  test('إيداع من غير صاحب المشروع مرفوض (403)', async () => {
    const { projectId, proposalId } = await setupProjectWithAcceptedProposal();
    const stranger = await signup();
    const res = await api()
      .post('/api/payments')
      .set(authHeader(stranger.token))
      .send({ projectId, proposalId, amount: 100, method: 'Visa' });
    expect(res.status).toBe(403);
  });

  test('إيداع بدون تحديد المستلم (400)', async () => {
    const { client, projectId } = await setupProjectWithAcceptedProposal();
    const res = await api()
      .post('/api/payments')
      .set(authHeader(client.token))
      .send({ projectId, amount: 100, method: 'Visa' });
    expect(res.status).toBe(400);
  });

  test('تحرير دفعة غير موجودة (404) أو من غير المصرح (403)', async () => {
    const { client, freelancer, projectId, proposalId } =
      await setupProjectWithAcceptedProposal();

    const deposit = await api()
      .post('/api/payments')
      .set(authHeader(client.token))
      .send({ projectId, proposalId, amount: 100, method: 'Visa' });
    const paymentId = deposit.body.data._id;

    const notFound = await api()
      .put('/api/payments/000000000000000000000000/release')
      .set(authHeader(client.token));
    expect(notFound.status).toBe(404);

    const forbidden = await api()
      .put(`/api/payments/${paymentId}/release`)
      .set(authHeader(freelancer.token));
    expect(forbidden.status).toBe(403);
  });
});
