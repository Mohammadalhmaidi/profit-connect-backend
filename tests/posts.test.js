// اختبارات المنشورات: إنشاء، خلاصة، إعجاب، تعليق، مشاركة (عداد + منع التكرار)
const { connectTestDb, clearDb, disconnectTestDb } = require('./helpers/db');
const { api, signup, authHeader } = require('./helpers/api');

describe('Posts', () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearDb();
  });

  test('createPost/getPosts/getPost: إنشاء منشور وزيادة عدده وظهوره في الخلاصة', async () => {
    const me = await signup();

    const created = await api()
      .post('/api/posts')
      .send({ content: 'منشور اختبار جيد المحتوى' })
      .set(authHeader(me.token));
    expect(created.status).toBe(201);
    expect(created.body.data.content).toBe('منشور اختبار جيد المحتوى');
    const postId = created.body.data._id;

    const meAfter = await api().get('/api/user/' + me.userId).set(authHeader(me.token));
    expect(meAfter.body.data.postsCount).toBe(1);

    const feed = await api().get('/api/posts').set(authHeader(me.token));
    expect(feed.status).toBe(200);
    expect(feed.body.data.length).toBe(1);
    expect(feed.body.data[0]._id).toBe(postId);
    expect(feed.body.data[0].user.profile.firstName).toBe('علي');

    const detail = await api().get('/api/posts/' + postId).set(authHeader(me.token));
    expect(detail.status).toBe(200);
  });

  test('toggleLike: إعجاب ثم إلغاؤه', async () => {
    const me = await signup();
    const other = await signup();

    const post = await api()
      .post('/api/posts')
      .send({ content: 'منشور للإعجاب' })
      .set(authHeader(me.token));

    const like = await api()
      .post('/api/posts/' + post.body.data._id + '/like')
      .set(authHeader(other.token));
    expect(like.status).toBe(200);
    expect(like.body.likesCount).toBe(1);
    expect(like.body.isLiked).toBe(true);

    const unlike = await api()
      .post('/api/posts/' + post.body.data._id + '/like')
      .set(authHeader(other.token));
    expect(unlike.body.likesCount).toBe(0);
    expect(unlike.body.isLiked).toBe(false);
  });

  test('addComment + toggleCommentLike: تعليق وإعجاب به', async () => {
    const me = await signup();
    const other = await signup();

    const post = await api()
      .post('/api/posts')
      .send({ content: 'منشور للتعليق' })
      .set(authHeader(me.token));
    const postId = post.body.data._id;

    const comment = await api()
      .post('/api/posts/' + postId + '/comments')
      .send({ content: 'تعليق رائع' })
      .set(authHeader(other.token));
    expect(comment.status).toBe(201);
    expect(comment.body.commentsCount).toBe(1);

    // جلب المنشور لاستخراج معرّف التعليق (نقطة الإضافة لا تعيده)
    const postDetail = await api().get('/api/posts/' + postId).set(authHeader(me.token));
    const commentId = postDetail.body.data.comments[0]._id;

    const liked = await api()
      .post('/api/posts/' + postId + '/comments/' + commentId + '/like')
      .set(authHeader(me.token));
    expect(liked.status).toBe(200);
    expect(liked.body.isLiked).toBe(true);
    expect(liked.body.likesCount).toBe(1);
  });

  test('sharePost: يعيد shareCount ويعتبر المشارك قد شارك (alreadyShared) بدون تكرار', async () => {
    const me = await signup();
    const other = await signup();

    const post = await api()
      .post('/api/posts')
      .send({ content: 'منشور للمشاركة' })
      .set(authHeader(me.token));
    const postId = post.body.data._id;

    const first = await api()
      .post('/api/posts/' + postId + '/share')
      .set(authHeader(other.token));
    expect(first.status).toBe(200);
    expect(first.body.shareCount).toBe(1);
    expect(first.body.alreadyShared).toBeUndefined();

    const second = await api()
      .post('/api/posts/' + postId + '/share')
      .set(authHeader(other.token));
    expect(second.status).toBe(200);
    expect(second.body.shareCount).toBe(1);
    expect(second.body.alreadyShared).toBe(true);

    const detail = await api().get('/api/posts/' + postId).set(authHeader(me.token));
    expect(detail.body.data.shareCount).toBe(1);
  });

  test('sharePost: 404 لمنشور غير موجود', async () => {
    const me = await signup();
    const res = await api()
      .post('/api/posts/507f1f77bcf86cd799439011/share')
      .set(authHeader(me.token));
    expect(res.status).toBe(404);
  });

  test('updatePost/deletePost: تعديل وحذف مع تناقص العداد', async () => {
    const me = await signup();

    const post = await api()
      .post('/api/posts')
      .send({ content: 'نص أولي' })
      .set(authHeader(me.token));
    const postId = post.body.data._id;

    const updated = await api()
      .put('/api/posts/' + postId)
      .send({ content: 'نص معدل' })
      .set(authHeader(me.token));
    expect(updated.status).toBe(200);
    expect(updated.body.data.content).toBe('نص معدل');

    const deleted = await api()
      .delete('/api/posts/' + postId)
      .set(authHeader(me.token));
    expect(deleted.status).toBe(200);

    const meAfter = await api().get('/api/user/' + me.userId).set(authHeader(me.token));
    expect(meAfter.body.data.postsCount).toBe(0);
  });
});