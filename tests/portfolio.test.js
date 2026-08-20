// اختبارات المعرض: إنشاء أعمال (مع رفع وسائط)، المجموعات، الإعجاب، ربط المشروع
const mongoose = require('mongoose');
const { connectTestDb, clearDb, disconnectTestDb } = require('./helpers/db');
const { api, signup, authHeader, tinyPng } = require('./helpers/api');
const Project = require('../src/models/Project');

describe('Portfolio', () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearDb();
  });

  test('createItem: يرفض بلا وسائط وينجح مع صورة ويرفع عداد المعرض', async () => {
    const me = await signup();

    const rejected = await api()
      .post('/api/portfolio/items')
      .field('title', 'عمل بلا صورة')
      .field('category', 'تصميم')
      .set(authHeader(me.token));
    expect(rejected.status).toBe(400);

    const created = await api()
      .post('/api/portfolio/items')
      .field('title', 'موقع تجارة إلكترونية')
      .field('category', 'تطوير واجهات')
      .field('description', 'تصميم متجر كامل')
      .field('tags', JSON.stringify(['React', 'Node']))
      .field('skills', JSON.stringify(['React', 'Express']))
      .attach('media', tinyPng, 'work.png')
      .set(authHeader(me.token));
    expect(created.status).toBe(201);
    expect(created.body.data.title).toBe('موقع تجارة إلكترونية');
    expect(created.body.data.coverImage).toBeTruthy();
    expect(created.body.data.media.length).toBe(1);
    const itemId = created.body.data._id;

    const meAfter = await api().get('/api/user/' + me.userId).set(authHeader(me.token));
    expect(meAfter.body.data.profile.portfolioCount).toBe(1);

    const myItems = await api().get('/api/portfolio/items').set(authHeader(me.token));
    expect(myItems.status).toBe(200);
    expect(myItems.body.data.length).toBe(1);
    expect(myItems.body.data[0]._id).toBe(itemId);
  });

  test('createItem مع linkedProject يعيد المشروع مربوطاً في getMyItems', async () => {
    const me = await signup();

    const project = await Project.create({
      title: 'مشروع تطبيق',
      description: 'وصف المشروع',
      category: 'تطوير',
      client: me.userId,
    });

    const created = await api()
      .post('/api/portfolio/items')
      .field('title', 'عمل مربوط بمشروع')
      .field('category', 'تطوير')
      .field('linkedProject', project._id.toString())
      .attach('media', tinyPng, 'work.png')
      .set(authHeader(me.token));
    expect(created.status).toBe(201);
    expect(created.body.data.linkedProject).toBe(String(project._id));

    const myItems = await api().get('/api/portfolio/items').set(authHeader(me.token));
    expect(myItems.body.data[0].linkedProject._id).toBe(String(project._id));
  });

  test('معرض مستخدم آخر + إعجاب + نقض الإعجاب', async () => {
    const me = await signup();
    const other = await signup({ firstName: 'هند' });

    const item = await api()
      .post('/api/portfolio/items')
      .field('title', 'عمل هند')
      .field('category', 'فن')
      .attach('media', tinyPng, 'work.png')
      .set(authHeader(other.token));
    const itemId = item.body.data._id;

    const userItems = await api()
      .get('/api/portfolio/users/' + other.userId + '/items')
      .set(authHeader(me.token));
    expect(userItems.status).toBe(200);
    expect(userItems.body.data.length).toBe(1);

    const like = await api()
      .post('/api/portfolio/items/' + itemId + '/like')
      .set(authHeader(me.token));
    expect(like.status).toBe(200);
    expect(like.body.likesCount).toBe(1);

    const unlike = await api()
      .post('/api/portfolio/items/' + itemId + '/like')
      .set(authHeader(me.token));
    expect(unlike.body.likesCount).toBe(0);
  });

  test('المجموعات: إنشاء، إضافة عمل، رؤيتها بأعمالها', async () => {
    const me = await signup();

    const item = await api()
      .post('/api/portfolio/items')
      .field('title', 'عمل المجموعة')
      .field('category', 'تصوير')
      .attach('media', tinyPng, 'work.png')
      .set(authHeader(me.token));
    const itemId = item.body.data._id;

    const collection = await api()
      .post('/api/portfolio/collections')
      .send({ name: 'مشاريعي المفضلة' })
      .set(authHeader(me.token));
    expect(collection.status).toBe(201);
    const collectionId = collection.body.data._id;

    const add = await api()
      .post('/api/portfolio/collections/' + collectionId + '/items/' + itemId)
      .set(authHeader(me.token));
    expect(add.status).toBe(200);

    const myCollections = await api()
      .get('/api/portfolio/collections')
      .set(authHeader(me.token));
    expect(myCollections.body.data.length).toBe(1);
    expect(myCollections.body.data[0].items.length).toBe(1);
  });

  test('تعديل وحذف العمل', async () => {
    const me = await signup();

    const item = await api()
      .post('/api/portfolio/items')
      .field('title', 'عمل سابق')
      .field('category', 'كتابة')
      .attach('media', tinyPng, 'work.png')
      .set(authHeader(me.token));
    const itemId = item.body.data._id;

    const updated = await api()
      .put('/api/portfolio/items/' + itemId)
      .field('title', 'عمل معدل')
      .set(authHeader(me.token));
    expect(updated.status).toBe(200);
    expect(updated.body.data.title).toBe('عمل معدل');

    const deleted = await api()
      .delete('/api/portfolio/items/' + itemId)
      .set(authHeader(me.token));
    expect(deleted.status).toBe(200);

    const after = await api().get('/api/portfolio/items').set(authHeader(me.token));
    expect(after.body.data.length).toBe(0);
  });
});