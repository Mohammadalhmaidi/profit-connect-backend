// اختبارات المستخدمين: الملفات، المتابعة (الإلغاء الذاتي والعدادات)، قوائم المتابعين/المتابَعين لملف آخر
const { connectTestDb, clearDb, disconnectTestDb } = require('./helpers/db');
const { api, signup, authHeader } = require('./helpers/api');
const User = require('../src/models/User');

describe('Users', () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearDb();
  });

  test('getUserById: ملف المستخدم مع isFollowing وعدد المنشورات', async () => {
    const me = await signup();
    const other = await signup({ firstName: 'نور' });

    const res = await api().get('/api/user/' + other.userId).set(authHeader(me.token));

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(other.userId);
    expect(res.body.data.isFollowing).toBe(false);
    expect(res.body.data.profile.firstName).toBe('نور');
    expect(res.body.data.posts).toBeDefined();

    // بعد المتابعة
    await api().post('/api/user/' + other.userId + '/follow').set(authHeader(me.token));
    const after = await api().get('/api/user/' + other.userId).set(authHeader(me.token));
    expect(after.body.data.isFollowing).toBe(true);
  });

  test('getUserById: 404 لمستخدم غير موجود', async () => {
    const me = await signup();
    const res = await api()
      .get('/api/user/507f1f77bcf86cd799439011')
      .set(authHeader(me.token));
    expect(res.status).toBe(404);
  });

  test('toggleFollow: يمنع متابعة النفس', async () => {
    const me = await signup();
    const res = await api()
      .post('/api/user/' + me.userId + '/follow')
      .set(authHeader(me.token));
    expect(res.status).toBe(400);
  });

  test('toggleFollow: متابعة تزيد العدادات لحظياً وإلغاء ينقصها', async () => {
    const me = await signup();
    const other = await signup();

    const follow = await api()
      .post('/api/user/' + other.userId + '/follow')
      .set(authHeader(me.token));
    expect(follow.status).toBe(200);
    expect(follow.body.following).toBe(true);

    const meAfter = await api().get('/api/user/' + me.userId).set(authHeader(me.token));
    expect(meAfter.body.data.followingCount).toBe(1);
    const otherAfter = await api().get('/api/user/' + other.userId).set(authHeader(me.token));
    expect(otherAfter.body.data.followersCount).toBe(1);

    // متابعة مكررة = إلغاء
    const unfollow = await api()
      .post('/api/user/' + other.userId + '/follow')
      .set(authHeader(me.token));
    expect(unfollow.body.following).toBe(false);

    const meFinal = await api().get('/api/user/' + me.userId).set(authHeader(me.token));
    expect(meFinal.body.data.followingCount).toBe(0);
  });

  test('getFollowers/getFollowing لملف مستخدم آخر + 404 لمعدوم', async () => {
    const me = await signup({ firstName: 'سامي' });
    const other = await signup({ firstName: 'ريم' });
    const third = await signup();

    await api().post('/api/user/' + other.userId + '/follow').set(authHeader(me.token));
    await api().post('/api/user/' + me.userId + '/follow').set(authHeader(third.token));

    const followers = await api()
      .get('/api/user/' + me.userId + '/followers')
      .set(authHeader(other.token));
    expect(followers.status).toBe(200);
    expect(followers.body.count).toBe(1);
    expect(followers.body.data[0]._id).toBe(third.userId);

    // من يتابعهم "أنا" — هو "other" (من يتابعهم الآخر يكونون طلبات المتابعة السابقة للناس)
    const following = await api()
      .get('/api/user/' + me.userId + '/following')
      .set(authHeader(other.token));
    expect(following.body.count).toBe(1);
    expect(following.body.data[0]._id).toBe(other.userId);

    const missing = await api()
      .get('/api/user/507f1f77bcf86cd799439011/followers')
      .set(authHeader(me.token));
    expect(missing.status).toBe(404);
  });

  test('getFollowers يتجاهل الحسابات المحذوفة في قائمة مستخدم آخر', async () => {
    const me = await signup();
    const other = await signup();
    const ghost = await signup();

    await api().post('/api/user/' + other.userId + '/follow').set(authHeader(ghost.token));
    await User.deleteOne({ _id: ghost.userId });

    const res = await api()
      .get('/api/user/' + other.userId + '/followers')
      .set(authHeader(me.token));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  test('getUserProfile: ملفي الشخصي مع الحقول الأساسية', async () => {
    const { token, payload } = await signup();

    const res = await api().get('/api/user/profile').set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.data.profile.firstName).toBe(payload.firstName);
    expect(res.body.data.profile.followersCount).toBe(0);
  });

  test('leaderboard/top-users مسار عام يعيد مصفوفة', async () => {
    await signup();
    const res = await api().get('/api/user/leaderboard/top-users');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data || res.body.users)).toBe(true);
  });
});