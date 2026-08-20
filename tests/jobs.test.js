// اختبارات الوظائف: بحث عام، فلترة، نشر بصلاحيات الشركة المعتمدة
const mongoose = require('mongoose');
const { connectTestDb, clearDb, disconnectTestDb } = require('./helpers/db');
const { api, signup, authHeader } = require('./helpers/api');
const Company = require('../src/models/Company');
const Job = require('../src/models/Job');

const seedApprovedCompany = async (ownerId, name) =>
  Company.create({
    name: name || 'شركة الاختبار',
    description: 'وصف شركة',
    industry: 'تقنية',
    location: { country: 'السعودية', city: 'الرياض' },
    owner: ownerId,
    status: 'Approved',
  });

describe('Jobs', () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearDb();
  });

  test('getJobs: مسار عام يعيد قائمة (حتى بدون توكن) ولا يظهر الوظائف المغلقة', async () => {
    const employer = await signup({}, 'Employer');
    const company = await seedApprovedCompany(employer.userId, 'شركة عامة آزمون');

    await Job.create({
      title: 'مطور فلاتر',
      description: 'تطوير تطبيقات',
      company: company._id,
      location: 'الرياض',
      postedBy: employer.userId,
      status: 'Open',
    });
    await Job.create({
      title: 'وظيفة مغلقة',
      description: 'لا تظهر',
      company: company._id,
      location: 'جدة',
      postedBy: employer.userId,
      status: 'Closed',
    });

    const res = await api().get('/api/jobs');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].title).toBe('مطور فلاتر');
    expect(res.body.data[0].company.name).toBe('شركة عامة آزمون');
  });

  test('getJobs: فلترة البحث بالنص (search فلترة title)', async () => {
    const employer = await signup({}, 'Employer');
    const company = await seedApprovedCompany(employer.userId, 'شركة النشر');

    await Job.create({
      title: 'محلل بيانات',
      description: 'تحليل',
      company: company._id,
      location: 'جدة',
      postedBy: employer.userId,
    });
    await Job.create({
      title: 'مصمم واجهات',
      description: 'تصميم',
      company: company._id,
      location: 'الدمام',
      postedBy: employer.userId,
    });

    const res = await api().get('/api/jobs?search=' + encodeURIComponent('محلل'));
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].title).toBe('محلل بيانات');

    const none = await api().get('/api/jobs?search=' + encodeURIComponent('كلمات-لا-توجد'));
    expect(none.body.data.length).toBe(0);
  });

  test('createJob: يرفض بدون شركة معتمدة أو بلا صلاحية، وينجح للمالك', async () => {
    const employer = await signup({}, 'Employer');
    const intruder = await signup({ firstName: 'دخيل' });
    const company = await seedApprovedCompany(employer.userId, 'شركة معتمدة');

    const noCompany = await api()
      .post('/api/jobs')
      .send({ title: 'وظيفة', description: 'وصف', location: 'الرياض' })
      .set(authHeader(employer.token));
    expect(noCompany.status).toBe(400);

    const notOwner = await api()
      .post('/api/jobs')
      .send({
        companyId: company._id.toString(),
        title: 'وظيفة دخيل',
        description: 'وصف',
        location: 'الرياض',
      })
      .set(authHeader(intruder.token));
    expect(notOwner.status).toBe(403);

    const ok = await api()
      .post('/api/jobs')
      .send({
        companyId: company._id.toString(),
        title: 'مطور باكند',
        description: 'بناء واجهات برمجية',
        location: 'الرياض',
        type: 'Full-time',
        workLevel: 'Mid',
      })
      .set(authHeader(employer.token));
    expect(ok.status).toBe(201);
    expect(ok.body.data.title).toBe('مطور باكند');
    expect(ok.body.data.status).toBe('Open');
  });

  test('getJobById: نجاح للوظيفة الموجودة و404 لغيره', async () => {
    const employer = await signup({}, 'Employer');
    const company = await seedApprovedCompany(employer.userId, 'شركة التفاصيل');

    const job = await Job.create({
      title: 'مدير مشروع',
      description: 'إدارة',
      company: company._id,
      location: 'الخبر',
      postedBy: employer.userId,
    });

    const res = await api().get('/api/jobs/' + job._id.toString());
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('مدير مشروع');

    const missing = await api().get('/api/jobs/507f1f77bcf86cd799439011');
    expect(missing.status).toBe(404);
  });
});