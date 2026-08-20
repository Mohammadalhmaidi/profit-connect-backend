// اختبارات الشبكة: طلبات الاتصال، جهات الاتصال، المتابعون/المتابَعون، البحث، المقترحات
const { connectTestDb, clearDb, disconnectTestDb } = require('./helpers/db');
const { api, signup, authHeader } = require('./helpers/api');
const User = require('../src/models/User');

describe('Network', () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearDb();
  });

  describe('طلبات الاتصال', () => {
    test('إرسال طلب اتصال: نجاح لمستخدم موجود + رفض للنفس + 404 لمعدوم', async () => {
      const me = await signup();
      const other = await signup();

      const toSelf = await api()
        .post('/api/network/connect/' + me.userId)
        .set(authHeader(me.token));
      expect(toSelf.status).toBe(400);

      const toMissing = await api()
        .post('/api/network/connect/507f1f77bcf86cd799439011')
        .set(authHeader(me.token));
      expect(toMissing.status).toBe(404);

      const toInvalid = await api()
        .post('/api/network/connect/not-an-id')
        .set(authHeader(me.token));
      expect(toInvalid.status).toBe(400);

      const ok = await api()
        .post('/api/network/connect/' + other.userId)
        .set(authHeader(me.token));
      expect(ok.status).toBe(201);
      expect(ok.body.data.status).toBe('pending');

      // المستلم تلقى إشعاراً
      const recipient = await User.findById(other.userId);
      expect(recipient.notifications.some((n) => n.type === 'connection_request')).toBe(true);
    });

    test('منع تكرار الطلب بين نفس الزوج', async () => {
      const me = await signup();
      const other = await signup();

      await api().post('/api/network/connect/' + other.userId).set(authHeader(me.token));
      const again = await api()
        .post('/api/network/connect/' + other.userId)
        .set(authHeader(me.token));
      expect(again.status).toBe(400);
    });

    test('الطلبات الواردة والمرسلة تُعرض مع بيانات الطرف الآخر', async () => {
      const me = await signup({ firstName: 'أحمد' });
      const other = await signup({ firstName: 'فاطمة' });

      await api().post('/api/network/connect/' + me.userId).set(authHeader(other.token));

      const incoming = await api().get('/api/network/requests').set(authHeader(me.token));
      expect(incoming.status).toBe(200);
      expect(incoming.body.count).toBe(1);
      expect(incoming.body.data[0].requester.profile.firstName).toBe('فاطمة');

      const sent = await api().get('/api/network/sent-requests').set(authHeader(other.token));
      expect(sent.status).toBe(200);
      expect(sent.body.count).toBe(1);
      expect(sent.body.data[0].recipient.profile.firstName).toBe('أحمد');
    });

    test('القبول: المستلم فقط، ويصبحا متصلين، ويرفض القبول المكرر', async () => {
      const me = await signup();
      const other = await signup();

      await api().post('/api/network/connect/' + me.userId).set(authHeader(other.token));
      const requests = await api().get('/api/network/requests').set(authHeader(me.token));
      const requestId = requests.body.data[0]._id;

      // المرسل لا يستطيع القبول
      const byRequester = await api()
        .put('/api/network/accept/' + requestId)
        .set(authHeader(other.token));
      expect(byRequester.status).toBe(403);

      const accept = await api()
        .put('/api/network/accept/' + requestId)
        .set(authHeader(me.token));
      expect(accept.status).toBe(200);

      // قبول مكرر مرفوض
      const twice = await api()
        .put('/api/network/accept/' + requestId)
        .set(authHeader(me.token));
      expect(twice.status).toBe(400);

      const status = await api()
        .get('/api/network/status/' + other.userId)
        .set(authHeader(me.token));
      expect(status.body.data.status).toBe('connected');
    });

    test('الرفض ثم محاولة إعادة الطلب (وثيقة مرفوضة قائمة تمنع الإرسال مجدداً)', async () => {
      const me = await signup();
      const other = await signup();

      await api().post('/api/network/connect/' + me.userId).set(authHeader(other.token));
      const requests = await api().get('/api/network/requests').set(authHeader(me.token));
      const reject = await api()
        .put('/api/network/reject/' + requests.body.data[0]._id)
        .set(authHeader(me.token));
      expect(reject.status).toBe(200);

      // سلوك قائم موثق: الطلب المرفوض يبقى وثيقة تمنع طلباً جديداً بينك وبينه
      const resend = await api()
        .post('/api/network/connect/' + other.userId)
        .set(authHeader(me.token));
      expect(resend.status).toBe(400);
    });

    test('إلغاء طلب مرسل معلّق ثم إعادة إرساله بنجاح', async () => {
      const me = await signup();
      const other = await signup();

      await api().post('/api/network/connect/' + other.userId).set(authHeader(me.token));
      const cancel = await api()
        .delete('/api/network/cancel/' + other.userId)
        .set(authHeader(me.token));
      expect(cancel.status).toBe(200);

      // بعد الإلغاء يُسمح بإرسال طلب جديد
      const resend = await api()
        .post('/api/network/connect/' + other.userId)
        .set(authHeader(me.token));
      expect(resend.status).toBe(201);

      // إلغاء الطلب الجديد المعلّق ثم إلغاء لغير موجود
      const cancelAgain = await api()
        .delete('/api/network/cancel/' + other.userId)
        .set(authHeader(me.token));
      expect(cancelAgain.status).toBe(200);

      const again = await api()
        .delete('/api/network/cancel/' + other.userId)
        .set(authHeader(me.token));
      expect(again.status).toBe(404);
    });
  });

  describe('جهات الاتصال', () => {
    let me, other, requestId;

    beforeEach(async () => {
      me = await signup({ firstName: 'محمود' });
      other = await signup({ firstName: 'لين' });
      await api().post('/api/network/connect/' + me.userId).set(authHeader(other.token));
      const requests = await api().get('/api/network/requests').set(authHeader(me.token));
      requestId = requests.body.data[0]._id;
      await api().put('/api/network/accept/' + requestId).set(authHeader(me.token));
    });

    test('getMyConnections يعيد الطرف الآخر فقط (وليس كائن الاتصال)', async () => {
      const res = await api().get('/api/network/connections').set(authHeader(me.token));

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.data[0]._id).toBe(other.userId);
      expect(res.body.data[0].profile.firstName).toBe('لين');
      expect(res.body.data[0].requester).toBeUndefined();
    });

    test('getMyConnections يتجاهل الحسابات المحذوفة بدل الانهيار (500)', async () => {
      // محاكاة حذف الطرف الآخر بعد قبول الاتصال — populate يعيد null والفلترة تتحمّل
      await User.deleteOne({ _id: other.userId });

      const res = await api().get('/api/network/connections').set(authHeader(me.token));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(0);
      expect(res.body.data).toEqual([]);
    });

    test('إحصائيات الشبكة: عدد الاتصالات والطلبات والمتابعات', async () => {
      const res = await api().get('/api/network/stats').set(authHeader(me.token));

      expect(res.status).toBe(200);
      expect(res.body.data.connectionsCount).toBe(1);
      expect(res.body.data.postsCount).toBe(0);
      expect(typeof res.body.data.followersCount).toBe('number');
      expect(typeof res.body.data.followingCount).toBe('number');
    });

    test('إزالة اتصال ثم فشل الإزالة الثانية', async () => {
      const remove = await api()
        .delete('/api/network/remove/' + other.userId)
        .set(authHeader(me.token));
      expect(remove.status).toBe(200);

      const again = await api()
        .delete('/api/network/remove/' + other.userId)
        .set(authHeader(me.token));
      expect(again.status).toBe(404);
    });
  });

  describe('المتابعون والمتابَعون', () => {
    test('قوائمي: المتابعون والمتابَعون + عداد التحديث اللحظي', async () => {
      const me = await signup();
      const follower = await signup();
      const followed = await signup();

      // follower يتابعني، وأنا أتابع followed
      await api().post('/api/user/' + me.userId + '/follow').set(authHeader(follower.token));
      await api().post('/api/user/' + followed.userId + '/follow').set(authHeader(me.token));

      const mine_schema = await api().get('/api/network/followers').set(authHeader(me.token));
      expect(mine_schema.status).toBe(200);
      expect(mine_schema.body.count).toBe(1);
      expect(mine_schema.body.data[0]._id).toBe(follower.userId);

      const following = await api().get('/api/network/following').set(authHeader(me.token));
      expect(following.body.count).toBe(1);
      expect(following.body.data[0]._id).toBe(followed.userId);

      const stats = await api().get('/api/network/stats').set(authHeader(me.token));
      expect(stats.body.data.followersCount).toBe(1);
      expect(stats.body.data.followingCount).toBe(1);
    });

    test('قوائمي تتجاهل الحسابات المحذوفة (لا null في القائمة)', async () => {
      const me = await signup();
      const ghost = await signup();

      await api().post('/api/user/' + me.userId + '/follow').set(authHeader(ghost.token));
      // حذف المتابع مباشرة من قاعدة البيانات (محاكاة الحساب المحذوف)
      await User.deleteOne({ _id: ghost.userId });

      const res = await api().get('/api/network/followers').set(authHeader(me.token));

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('البحث والمقترحات', () => {
    test('searchUsers: يرفض بلا نص ويجد بالاسم مع حالة الاتصال', async () => {
      const me = await signup();
      const found = await signup({ firstName: 'يوسف' });
      const other = await signup({ firstName: 'زياد' });

      // اتصال مقبول بيني وبين "other"
      await api().post('/api/network/connect/' + me.userId).set(authHeader(other.token));
      const requests = await api().get('/api/network/requests').set(authHeader(me.token));
      await api().put('/api/network/accept/' + requests.body.data[0]._id).set(authHeader(me.token));

      const empty = await api().get('/api/network/search').set(authHeader(me.token));
      expect(empty.status).toBe(400);

      const res = await api()
        .get('/api/network/search?q=' + encodeURIComponent('يوسف'))
        .set(authHeader(me.token));
      expect(res.status).toBe(200);
      expect(res.body.count).toBeGreaterThanOrEqual(1);
      const yuser = res.body.data.find((u) => u._id === found.userId);
      expect(yuser).toBeDefined();
      expect(yuser.connectionStatus).toBe('none');

      const connected = await api()
        .get('/api/network/search?q=' + encodeURIComponent('زياد'))
        .set(authHeader(me.token));
      const connUser = connected.body.data.find((u) => u._id === other.userId);
      expect(connUser).toBeDefined();
      expect(connUser.connectionStatus).toBe('accepted');
    });

    test('discoverUsers: يعيد connectionStatus لكل مقترح ولا يشمل نفسي', async () => {
      const me = await signup();
      const stranger = await signup({ firstName: 'غريب' });
      const buddy = await signup({ firstName: 'صديق' });

      await api().post('/api/network/connect/' + me.userId).set(authHeader(buddy.token));
      const requests = await api().get('/api/network/requests').set(authHeader(me.token));
      await api().put('/api/network/accept/' + requests.body.data[0]._id).set(authHeader(me.token));

      const res = await api()
        .get('/api/network/discover?limit=20')
        .set(authHeader(me.token));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const ids = res.body.data.map((u) => u._id);
      expect(ids).not.toContain(me.userId);

      const byId = {};
      res.body.data.forEach((u) => { byId[u._id] = u; });
      expect(byId[buddy.userId].connectionStatus).toBe('accepted');
      expect(byId[stranger.userId].connectionStatus).toBe('none');
      res.body.data.forEach((u) => {
        expect(['none', 'pending', 'accepted', 'rejected']).toContain(u.connectionStatus);
      });
    });

    test('discoverUsers مع excludeFollowing=false يشمل من أتابعهم', async () => {
      const me = await signup();
      const followed = await signup();
      await api().post('/api/user/' + followed.userId + '/follow').set(authHeader(me.token));

      const res = await api()
        .get('/api/network/discover?limit=20&excludeFollowing=false')
        .set(authHeader(me.token));

      const ids = res.body.data.map((u) => u._id);
      expect(ids).toContain(followed.userId);
    });
  });
});