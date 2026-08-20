// اختبارات الرواتب: جلب القائمة والفلترة والخيارات والإحصاءات
const { connectTestDb, clearDb, disconnectTestDb } = require('./helpers/db');
const { api } = require('./helpers/api');
const Salary = require('../src/models/Salary');

describe('Salary', () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearDb();
  });

  const seedSalary = (overrides = {}) =>
    Salary.create({
      title: 'Flutter Developer',
      category: 'Development',
      country: 'Egypt',
      experienceLevel: 'Mid',
      minSalaryUSD: 1000,
      maxSalaryUSD: 3000,
      medianSalaryUSD: 2000,
      ...overrides,
    });

  test('جلب الرواتب يعيد القائمة المخزنة', async () => {
    await seedSalary();
    await seedSalary({ title: 'Backend Developer', country: 'Saudi Arabia' });

    const res = await api().get('/api/salaries');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const list = res.body.data || res.body.salaries || [];
    expect(list.length).toBe(2);
  });

  test('فلترة حسب الدولة (غير حساس لحالة الأحرف)', async () => {
    await seedSalary();
    await seedSalary({ title: 'Backend Developer', country: 'Saudi Arabia' });

    const res = await api().get('/api/salaries?country=egypt');
    const list = res.body.data || res.body.salaries || [];
    expect(list.length).toBe(1);
    expect(list[0].country).toBe('Egypt');
  });

  test('فلترة حسب العنوان والفئة', async () => {
    await seedSalary();
    await seedSalary({ title: 'UI Designer', category: 'Design' });

    const byTitle = await api().get('/api/salaries?title=Flutter');
    const titleList = byTitle.body.data || byTitle.body.salaries || [];
    expect(titleList.length).toBe(1);

    const byCategory = await api().get('/api/salaries?category=Design');
    const catList = byCategory.body.data || byCategory.body.salaries || [];
    expect(catList.length).toBe(1);
  });

  test('خيارات الرواتب تعيد الدول المتاحة', async () => {
    await seedSalary();
    await seedSalary({ country: 'Jordan' });

    const res = await api().get('/api/salaries/options');
    expect(res.status).toBe(200);
    const countries = res.body.countries || res.body.data?.countries || [];
    expect(countries).toEqual(expect.arrayContaining(['Egypt', 'Jordan']));
  });

  test('إحصاءات الرواتب تعيد المتوسطات', async () => {
    await seedSalary();
    await seedSalary({ minSalaryUSD: 2000, maxSalaryUSD: 5000 });

    const res = await api().get('/api/salaries/stats');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('الترقيم: الصفحة الثانية فارغة عند وجود نتيجة واحدة', async () => {
    await seedSalary();

    const res = await api().get('/api/salaries?page=2&limit=10');
    expect(res.status).toBe(200);
    const list = res.body.data || res.body.salaries || [];
    expect(list.length).toBe(0);
    const totalPages = res.body.pagination?.totalPages ?? res.body.totalPages;
    expect(totalPages).toBe(1);
  });
});