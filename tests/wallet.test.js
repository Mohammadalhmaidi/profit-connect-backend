// اختبارات المحفظة: جلب الرصيد، طلب سحب (نجاح/رصيد غير كافٍ)، إلغاء السحب
const { connectTestDb, clearDb, disconnectTestDb } = require('./helpers/db');
const { api, signup, authHeader } = require('./helpers/api');
const User = require('../src/models/User');

describe('Wallet', () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearDb();
  });

  test('جلب المحفظة يعيد الرصيد والتحويلات بلا معاملات', async () => {
    const { token, userId } = await signup();

    const res = await api().get('/api/wallet').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(data.wallet.balance).toBe(0);
    expect(data.wallet.holding).toBe(0);
    expect(data.wallet.inEscrow).toBe(0);
    expect(data.wallet.inEscrowCount).toBe(0);
    expect(Array.isArray(data.transactions)).toBe(true);
    expect(data.transactions.length).toBe(0);
  });

  test('طلب سحب بدون مبلغ يُرفض (400)', async () => {
    const { token } = await signup();
    const res = await api()
      .post('/api/wallet/withdraw')
      .set(authHeader(token))
      .send({ amount: 0, method: 'bank_transfer' });
    expect(res.status).toBe(400);
  });

  test('طلب سحب برصيد غير كافٍ يُرفض (400)', async () => {
    const { token } = await signup();
    const res = await api()
      .post('/api/wallet/withdraw')
      .set(authHeader(token))
      .send({ amount: 500, method: 'bank_transfer', accountDetails: 'iban123' });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('رصيد');
  });

  test('طلب سحب ناجح يخصم الرصيد ويحجزه ويسجل معاملة', async () => {
    const { token, userId } = await signup();
    await User.findByIdAndUpdate(userId, {
      $set: { 'wallet.balance': 1000 },
    });

    const res = await api()
      .post('/api/wallet/withdraw')
      .set(authHeader(token))
      .send({ amount: 300, method: 'bank_transfer', accountDetails: 'iban123' });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);

    const wallet = await api().get('/api/wallet').set(authHeader(token));
    expect(wallet.body.data.wallet.balance).toBe(700);
    expect(wallet.body.data.wallet.holding).toBe(300);
    expect(wallet.body.data.transactions.length).toBe(1);
    expect(wallet.body.data.transactions[0].type).toBe('withdraw');
  });

  test('قائمة طلبات السحب تعيد الطلبات المسجلة', async () => {
    const { token, userId } = await signup();
    await User.findByIdAndUpdate(userId, {
      $set: { 'wallet.balance': 1000 },
    });
    await api()
      .post('/api/wallet/withdraw')
      .set(authHeader(token))
      .send({ amount: 100, method: 'bank_transfer', accountDetails: 'iban1' });

    const res = await api().get('/api/wallet/withdrawals').set(authHeader(token));
    expect(res.status).toBe(200);
    const withdrawals = res.body.withdrawals || res.body.data || [];
    expect(Array.isArray(withdrawals)).toBe(true);
    expect(withdrawals.length).toBe(1);
  });

  test('إلغاء سحب قيد المراجعة يعيد الرصيد للمحفظة', async () => {
    const { token, userId } = await signup();
    await User.findByIdAndUpdate(userId, {
      $set: { 'wallet.balance': 1000 },
    });
    await api()
      .post('/api/wallet/withdraw')
      .set(authHeader(token))
      .send({ amount: 200, method: 'bank_transfer', accountDetails: 'iban1' });

    const withdrawals = await api().get('/api/wallet/withdrawals').set(authHeader(token));
    const withdrawalId = (withdrawals.body.withdrawals || withdrawals.body.data)[0]._id;

    const res = await api()
      .post(`/api/wallet/withdrawals/${withdrawalId}/cancel`)
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const wallet = await api().get('/api/wallet').set(authHeader(token));
    expect(wallet.body.data.wallet.balance).toBe(1000);
    expect(wallet.body.data.wallet.holding).toBe(0);
  });
});