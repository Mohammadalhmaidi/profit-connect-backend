// اختبارات تحسين النص: نجاح وفراغ وتحقق
jest.mock('../src/services/aiEvaluationService', () => ({
  translateContent: jest.fn(),
  improveContent: jest.fn(),
  evaluateContent: jest.fn(),
  evaluateWithContext: jest.fn(),
  processDynamicScoring: jest.fn(),
  detectAIGenerated: jest.fn(),
}));

const { improveContent } = require('../src/services/aiEvaluationService');
const { connectTestDb, clearDb, disconnectTestDb } = require('./helpers/db');
const { api, signup, authHeader } = require('./helpers/api');

describe('Improve', () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearDb();
    improveContent.mockReset();
  });

  test('تحسين ناجح (200)', async () => {
    improveContent.mockResolvedValue('نص محسّن');
    const { token } = await signup();

    const res = await api()
      .post('/api/improve')
      .set(authHeader(token))
      .send({ text: 'نص عادي' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.improved).toBe('نص محسّن');
  });

  test('بدون نص مرفوض (400)', async () => {
    const { token } = await signup();
    const res = await api()
      .post('/api/improve')
      .set(authHeader(token))
      .send({ text: '   ' });
    expect(res.status).toBe(400);
  });

  test('فشل الذكاء الاصطناعي (500)', async () => {
    improveContent.mockRejectedValue(new Error('AI down'));
    const { token } = await signup();

    const res = await api()
      .post('/api/improve')
      .set(authHeader(token))
      .send({ text: 'نص' });
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
