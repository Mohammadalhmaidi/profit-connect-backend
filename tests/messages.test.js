// اختبارات الرسائل: المحادثات (بحث/حد)، الإرسال، القراءة، الترخيص
const { connectTestDb, clearDb, disconnectTestDb } = require('./helpers/db');
const { api, signup, authHeader } = require('./helpers/api');

describe('Messages', () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearDb();
  });

  test('getOrCreateConversation: إنشاء جديد ثم جلب نفس المحادثة؛ ورفض النفس ونقص المعرف', async () => {
    const me = await signup();
    const other = await signup({ firstName: 'هدى' });

    const missing = await api()
      .post('/api/messages/conversations')
      .send({})
      .set(authHeader(me.token));
    expect(missing.status).toBe(400);

    const self = await api()
      .post('/api/messages/conversations')
      .send({ recipientId: me.userId })
      .set(authHeader(me.token));
    expect(self.status).toBe(400);

    const created = await api()
      .post('/api/messages/conversations')
      .send({ recipientId: other.userId })
      .set(authHeader(me.token));
    expect(created.status).toBe(200);
    expect(created.body.data.participants.length).toBe(2);
    const conversationId = created.body.data._id;

    const existing = await api()
      .post('/api/messages/conversations')
      .send({ recipientId: other.userId })
      .set(authHeader(me.token));
    expect(existing.body.data._id).toBe(conversationId);
  });

  test('getMyConversations: يعيد محادثاتي مرتبة وتعمل فلترة بحث q', async () => {
    const me = await signup();
    const peerA = await signup({ firstName: 'عبدالله' });
    const peerB = await signup({ firstName: 'منى' });

    const convoA = await api()
      .post('/api/messages/conversations')
      .send({ recipientId: peerA.userId })
      .set(authHeader(me.token));
    await api()
      .post('/api/messages/conversations/' + convoA.body.data._id)
      .send({ content: 'مرحباً عبدالله' })
      .set(authHeader(me.token));

    await api()
      .post('/api/messages/conversations')
      .send({ recipientId: peerB.userId })
      .set(authHeader(me.token));

    const all = await api().get('/api/messages/conversations').set(authHeader(me.token));
    expect(all.status).toBe(200);
    expect(all.body.data.length).toBe(2);

    // بحث باسم الطرف الآخر
    const byName = await api()
      .get('/api/messages/conversations?q=' + encodeURIComponent('منى'))
      .set(authHeader(me.token));
    expect(byName.body.data.length).toBe(1);
    const peerIdsByName = byName.body.data[0].participants
      .map((p) => (p && p._id ? String(p._id) : String(p)))
      .filter((id) => id !== me.userId);
    expect(peerIdsByName).toContain(peerB.userId);

    // بحث بمحتوى آخر رسالة
    const byContent = await api()
      .get('/api/messages/conversations?q=' + encodeURIComponent('عبدالله'))
      .set(authHeader(me.token));
    expect(byContent.body.data.length).toBe(1);
    const peerIdsByContent = byContent.body.data[0].participants
      .map((p) => (p && p._id ? String(p._id) : String(p)))
      .filter((id) => id !== me.userId);
    expect(peerIdsByContent).toContain(peerA.userId);

    // بحث بلا نتائج
    const none = await api()
      .get('/api/messages/conversations?q=' + encodeURIComponent('لايوجد'))
      .set(authHeader(me.token));
    expect(none.body.data.length).toBe(0);
  });

  test('getMyConversations: يحترم حد limit في قاعدة الاستعلام', async () => {
    const me = await signup();

    for (let i = 0; i < 3; i++) {
      const peer = await signup({ firstName: 'مستخدم' + i });
      await api()
        .post('/api/messages/conversations')
        .send({ recipientId: peer.userId })
        .set(authHeader(me.token));
    }

    const res = await api()
      .get('/api/messages/conversations?limit=2')
      .set(authHeader(me.token));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(2);
  });

  test('sendMessage/getMessages: إرسال، رفض خارج المحادثة، وعلامة القراءة', async () => {
    const me = await signup();
    const other = await signup({ firstName: 'ليلى' });
    const outsider = await signup();

    const convo = await api()
      .post('/api/messages/conversations')
      .send({ recipientId: other.userId })
      .set(authHeader(me.token));
    const conversationId = convo.body.data._id;

    // بدون محتوى
    const noContent = await api()
      .post('/api/messages/conversations/' + conversationId)
      .send({})
      .set(authHeader(me.token));
    expect(noContent.status).toBe(400);

    // طرف خارجي لا يستطيع الإرسال أو القراءة
    const deniedSend = await api()
      .post('/api/messages/conversations/' + conversationId)
      .send({ content: 'اقتحام' })
      .set(authHeader(outsider.token));
    expect(deniedSend.status).toBe(403);

    const deniedRead = await api()
      .get('/api/messages/conversations/' + conversationId)
      .set(authHeader(outsider.token));
    expect(deniedRead.status).toBe(403);

    // إرسال سليم
    const sent = await api()
      .post('/api/messages/conversations/' + conversationId)
      .send({ content: 'أهلاً بك' })
      .set(authHeader(me.token));
    expect(sent.status).toBe(201);
    expect(sent.body.data.content).toBe('أهلاً بك');

    // المستلم يرى الرسالة غير مقروءة ثم تصبح مقروءة
    const unreadBefore = await api().get('/api/messages/unread').set(authHeader(other.token));
    expect(unreadBefore.body.unreadCount).toBe(1);

    const messages = await api()
      .get('/api/messages/conversations/' + conversationId)
      .set(authHeader(other.token));
    expect(messages.status).toBe(200);
    expect(messages.body.data.length).toBe(1);
    expect(messages.body.data[0].content).toBe('أهلاً بك');

    const unreadAfter = await api().get('/api/messages/unread').set(authHeader(other.token));
    expect(unreadAfter.body.unreadCount).toBe(0);
  });
});