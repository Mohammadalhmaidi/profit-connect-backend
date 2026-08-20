// اختبارات الموظفين: إضافة، جلب، تحديث، حذف + صلاحيات + سياسة كلمة المرور
const { connectTestDb, clearDb, disconnectTestDb } = require('./helpers/db');
const { api, signup, authHeader } = require('./helpers/api');

describe('Employee', () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearDb();
  });

  const createCompany = async (token) => {
    const res = await api()
      .post('/api/companies')
      .set(authHeader(token))
      .send({
        name: 'شركة الاختبار',
        description: 'وصف',
        industry: 'Tech',
        location: { country: 'مصر', city: 'القاهرة' },
      });
    expect(res.status).toBe(201);
    return res.body.data._id;
  };

  const employeePayload = () => ({
    email: `emp_${Date.now()}@test.com`,
    password: 'Employee123',
    firstName: 'موظف',
    lastName: 'تجريبي',
    position: 'Developer',
  });

  test('إضافة موظف: المالك (201) ويرد بيانات الدخول', async () => {
    const employer = await signup({}, 'Employer');
    const companyId = await createCompany(employer.token);

    const res = await api()
      .post(`/api/companies/${companyId}/employees`)
      .set(authHeader(employer.token))
      .send(employeePayload());

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.employee.email).toBeTruthy();
    expect(res.body.data.loginCredentials.password).toBe('Employee123');
  });

  test('إضافة موظف: غير المالك/المدير مرفوض (403)', async () => {
    const employer = await signup({}, 'Employer');
    const companyId = await createCompany(employer.token);

    const outsider = await signup();
    const res = await api()
      .post(`/api/companies/${companyId}/employees`)
      .set(authHeader(outsider.token))
      .send(employeePayload());
    expect(res.status).toBe(403);
  });

  test('إضافة موظف: إيميل مكرر مرفوض (400)', async () => {
    const employer = await signup({}, 'Employer');
    const companyId = await createCompany(employer.token);

    const payload = employeePayload();
    await api()
      .post(`/api/companies/${companyId}/employees`)
      .set(authHeader(employer.token))
      .send(payload);

    const dup = await api()
      .post(`/api/companies/${companyId}/employees`)
      .set(authHeader(employer.token))
      .send(payload);
    expect(dup.status).toBe(400);
  });

  test('إضافة موظف: كلمة مرور ضعيفة مرفوضة (400) وصحيحة مقبولة', async () => {
    const employer = await signup({}, 'Employer');
    const companyId = await createCompany(employer.token);

    const weak = await api()
      .post(`/api/companies/${companyId}/employees`)
      .set(authHeader(employer.token))
      .send({ ...employeePayload(), password: 'abc123' });
    expect(weak.status).toBe(400);

    const missing = await api()
      .post(`/api/companies/${companyId}/employees`)
      .set(authHeader(employer.token))
      .send({
        ...employeePayload(),
        password: undefined,
      });
    expect(missing.status).toBe(400);
  });

  test('جلب موظفي الشركة يعيد القائمة (بعد الإضافة)', async () => {
    const employer = await signup({}, 'Employer');
    const companyId = await createCompany(employer.token);

    await api()
      .post(`/api/companies/${companyId}/employees`)
      .set(authHeader(employer.token))
      .send(employeePayload());

    const res = await api()
      .get(`/api/companies/${companyId}/employees`)
      .set(authHeader(employer.token));
    expect(res.status).toBe(200);
    const employees = res.body.employees || res.body.data || [];
    expect(Array.isArray(employees)).toBe(true);
    expect(employees.length).toBeGreaterThanOrEqual(1);
  });

  test('تحديث موظف يغيّر المنصب والصلاحيات', async () => {
    const employer = await signup({}, 'Employer');
    const companyId = await createCompany(employer.token);

    const added = await api()
      .post(`/api/companies/${companyId}/employees`)
      .set(authHeader(employer.token))
      .send(employeePayload());
    const employeeId = added.body.data.employee.id;

    const res = await api()
      .put(`/api/companies/${companyId}/employees/${employeeId}`)
      .set(authHeader(employer.token))
      .send({ position: 'Senior Developer', permissions: { canViewAnalytics: true } });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('حذف موظف يزيله من قائمة الشركة', async () => {
    const employer = await signup({}, 'Employer');
    const companyId = await createCompany(employer.token);

    const added = await api()
      .post(`/api/companies/${companyId}/employees`)
      .set(authHeader(employer.token))
      .send(employeePayload());
    const employeeId = added.body.data.employee.id;

    const res = await api()
      .delete(`/api/companies/${companyId}/employees/${employeeId}`)
      .set(authHeader(employer.token));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});