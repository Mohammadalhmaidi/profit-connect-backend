// اختبارات الترجمة: نجاح عبر AI، وfallback إلى Google Translate، والتحقق من المدخلات
jest.mock('../src/services/aiEvaluationService', () => ({
  translateContent: jest.fn(),
  improveContent: jest.fn(),
  evaluateContent: jest.fn(),
  evaluateWithContext: jest.fn(),
  processDynamicScoring: jest.fn(),
  detectAIGenerated: jest.fn(),
}));

const { translateContent } = require('../src/services/aiEvaluationService');
const { connectTestDb, clearDb, disconnectTestDb } = require('./helpers/db');
const { api, signup, authHeader } = require('./helpers/api');

describe('Translate', () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearDb();
    translateContent.mockReset();
  });

  test('ترجمة ناجحة عبر AI (200)', async () => {
    translateContent.mockResolvedValue('مرحبا بالعالم');
    const { token } = await signup();

    const res = await api()
      .post('/api/translate')
      .set(authHeader(token))
      .send({ text: 'Hello world' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.translated).toBe('مرحبا بالعالم');
  });

  test('ترجمة بدون نص (400)', async () => {
    const { token } = await signup();
    const res = await api()
      .post('/api/translate')
      .set(authHeader(token))
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('عند فشل AI يلجأ إلى Google Translate (fallback)', async () => {
    translateContent.mockRejectedValue(new Error('AI down'));

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [[['أهلا', 'hello']]],
    });

    try {
      const { token } = await signup();
      const res = await api()
        .post('/api/translate')
        .set(authHeader(token))
        .send({ text: 'Hello' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.translated).toBe('أهلا');
      expect(global.fetch).toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('عند فشل الجميع (500)', async () => {
    translateContent.mockRejectedValue(new Error('AI down'));

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

    try {
      const { token } = await signup();
      const res = await api()
        .post('/api/translate')
        .set(authHeader(token))
        .send({ text: 'Hello' });
      expect(res.status).toBe(500);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
