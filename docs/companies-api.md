# Companies API Documentation

Base URLs:

- `/api/companies`
- `/api/admin/companies`

التوثيق أدناه مبني على التنفيذ الحالي في:
[companyRoutes.js](/home/amen/سطح المكتب/ProfitConectBackEnd/src/routes/companyRoutes.js)
[companyController.js](/home/amen/سطح المكتب/ProfitConectBackEnd/src/controllers/companyController.js)
[adminRoutes.js](/home/amen/سطح المكتب/ProfitConectBackEnd/src/routes/adminRoutes.js)
[adminController.js](/home/amen/سطح المكتب/ProfitConectBackEnd/src/controllers/adminController.js)
[Company.js](/home/amen/سطح المكتب/ProfitConectBackEnd/src/models/Company.js)

## ملاحظات مهمة

- جميع مسارات `/api/companies` محمية وتتطلب `Authorization: Bearer <token>`.
- جميع مسارات `/api/admin/companies` محمية وتتطلب أن يكون المستخدم دوره `Admin`.
- عند إنشاء شركة جديدة تكون حالتها الافتراضية `Pending`.
- عند اعتماد الشركة من الإدارة (`Approved`) يتم أيضًا ضبط `isVerified = true`.

## 1. إنشاء شركة

**Endpoint**

`POST /api/companies`

**Access**

Private

**Request Body**

| الحقل | النوع | مطلوب | الوصف |
|---|---|---:|---|
| `name` | `string` | نعم | اسم الشركة، ويجب أن يكون فريدًا |
| `description` | `string` | نعم | وصف الشركة |
| `industry` | `string` | نعم | مجال الشركة |
| `location` | `object` | نعم | موقع الشركة التفصيلي |
| `location.country` | `string` | نعم | الدولة |
| `location.city` | `string` | نعم | المدينة |
| `location.street` | `string` | لا | اسم الشارع |
| `location.buildingNumber` | `string` | لا | رقم البناء |
| `location.coordinates` | `object` | لا | الإحداثيات الجغرافية |
| `location.coordinates.x` | `number` | لا | خط الطول (longitude) |
| `location.coordinates.y` | `number` | لا | خط العرض (latitude) |
| `companySize` | `string` | لا | واحدة من: `1-10`, `11-50`, `51-200`, `201-500`, `501-1000`, `1000+` |
| `foundedYear` | `number` | لا | سنة التأسيس |
| `website` | `string` | لا | رابط الموقع |
| `contactEmail` | `string` | لا | بريد التواصل |
| `socialLinks` | `object` | لا | روابط الشبكات الاجتماعية |
| `socialLinks.linkedin` | `string` | لا | رابط LinkedIn |
| `socialLinks.twitter` | `string` | لا | رابط Twitter |

**Fields Added Automatically**

| الحقل | القيمة |
|---|---|
| `owner` | المستخدم الحالي |
| `admins` | مصفوفة تحتوي المستخدم الحالي |
| `status` | `Pending` |
| `isVerified` | `false` |
| `logo` | `default-company-logo.png` |
| `coverPhoto` | `default-company-cover.png` |
| `followersCount` | `0` |

**Example Request**

```json
{
  "name": "MaxTec Group",
  "description": "شركة رائدة في تقديم الحلول البرمجية.",
  "industry": "تكنولوجيا المعلومات",
  "location": {
    "country": "فلسطين",
    "city": "رام الله",
    "street": "شارع الملك عبدالله",
    "buildingNumber": "15",
    "coordinates": {
      "x": 35.2034,
      "y": 31.8996
    }
  },
  "companySize": "11-50",
  "foundedYear": 2020,
  "website": "https://maxtec.example.com",
  "contactEmail": "info@maxtec.com",
  "socialLinks": {
    "linkedin": "https://linkedin.com/company/maxtec",
    "twitter": "https://twitter.com/maxtec"
  }
}
```

**Success Response**

`201 Created`

```json
{
  "success": true,
  "data": {
    "_id": "company_id",
    "name": "MaxTec Group",
    "description": "شركة رائدة في تقديم الحلول البرمجية.",
    "industry": "تكنولوجيا المعلومات",
    "location": {
      "country": "فلسطين",
      "city": "رام الله",
      "street": "شارع الملك عبدالله",
      "buildingNumber": "15",
      "coordinates": {
        "type": "Point",
        "coordinates": [35.2034, 31.8996]
      }
    },
    "companySize": "11-50",
    "foundedYear": 2020,
    "logo": "default-company-logo.png",
    "coverPhoto": "default-company-cover.png",
    "website": "https://maxtec.example.com",
    "socialLinks": {
      "linkedin": "https://linkedin.com/company/maxtec",
      "twitter": "https://twitter.com/maxtec"
    },
    "contactEmail": "info@maxtec.com",
    "isVerified": false,
    "status": "Pending",
    "owner": "user_id",
    "admins": ["user_id"],
    "followers": [],
    "followersCount": 0,
    "createdAt": "2026-03-24T00:00:00.000Z",
    "updatedAt": "2026-03-24T00:00:00.000Z",
    "__v": 0
  }
}
```

**Error Responses**

- `400`: اسم الشركة مستخدم بالفعل
- `500`: خطأ أثناء إنشاء الشركة

## 2. جلب جميع الشركات

**Endpoint**

`GET /api/companies`

**Access**

Private

**Success Response**

`200 OK`

```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "_id": "company_id",
      "name": "MaxTec Group",
      "description": "شركة رائدة في تقديم الحلول البرمجية.",
      "industry": "تكنولوجيا المعلومات",
      "location": {
        "country": "فلسطين",
        "city": "رام الله",
        "street": "شارع الملك عبدالله",
        "buildingNumber": "15",
        "coordinates": {
          "type": "Point",
          "coordinates": [35.2034, 31.8996]
        }
      },
      "companySize": "11-50",
      "foundedYear": 2020,
      "logo": "default-company-logo.png",
      "coverPhoto": "default-company-cover.png",
      "website": "https://maxtec.example.com",
      "socialLinks": {
        "linkedin": "https://linkedin.com/company/maxtec",
        "twitter": "https://twitter.com/maxtec"
      },
      "contactEmail": "info@maxtec.com",
      "isVerified": false,
      "status": "Pending",
      "owner": {
        "_id": "user_id",
        "profile": {
          "firstName": "Ahmad",
          "lastName": "Ali",
          "avatar": "avatar.png"
        }
      },
      "admins": ["user_id"],
      "followers": [],
      "followersCount": 0,
      "createdAt": "2026-03-24T00:00:00.000Z",
      "updatedAt": "2026-03-24T00:00:00.000Z",
      "__v": 0
    }
  ]
}
```

**Error Responses**

- `500`: خطأ أثناء جلب الشركات

## 3. جلب شركة بواسطة ID

**Endpoint**

`GET /api/companies/:id`

**Access**

Private

**Path Params**

| الحقل | النوع | الوصف |
|---|---|---|
| `id` | `string` | معرف الشركة |

**Success Response**

`200 OK`

```json
{
  "success": true,
  "data": {
    "_id": "company_id",
    "name": "MaxTec Group",
    "description": "شركة رائدة في تقديم الحلول البرمجية.",
    "industry": "تكنولوجيا المعلومات",
    "location": {
      "country": "فلسطين",
      "city": "رام الله",
      "street": "شارع الملك عبدالله",
      "buildingNumber": "15",
      "coordinates": {
        "type": "Point",
        "coordinates": [35.2034, 31.8996]
      }
    },
    "companySize": "11-50",
    "foundedYear": 2020,
    "logo": "default-company-logo.png",
    "coverPhoto": "default-company-cover.png",
    "website": "https://maxtec.example.com",
    "socialLinks": {
      "linkedin": "https://linkedin.com/company/maxtec",
      "twitter": "https://twitter.com/maxtec"
    },
    "contactEmail": "info@maxtec.com",
    "isVerified": false,
    "status": "Pending",
    "owner": {
      "_id": "user_id",
      "profile": {
        "firstName": "Ahmad",
        "lastName": "Ali",
        "avatar": "avatar.png"
      }
    },
    "admins": ["user_id"],
    "followers": [],
    "followersCount": 0,
    "createdAt": "2026-03-24T00:00:00.000Z",
    "updatedAt": "2026-03-24T00:00:00.000Z",
    "__v": 0
  }
}
```

**Error Responses**

- `404`: الشركة غير موجودة
- `500`: خطأ في الخادم

## 4. متابعة أو إلغاء متابعة شركة

**Endpoint**

`POST /api/companies/:id/follow`

**Access**

Private

**Path Params**

| الحقل | النوع | الوصف |
|---|---|---|
| `id` | `string` | معرف الشركة |

**Request Body**

لا يوجد `body`.

**Success Response**

`200 OK`

```json
{
  "success": true,
  "isFollowing": true,
  "followersCount": 12
}
```

إذا كان المستخدم يتابع الشركة مسبقًا، نفس الطلب سيقوم بإلغاء المتابعة ويرجع:

```json
{
  "success": true,
  "isFollowing": false,
  "followersCount": 11
}
```

**Error Responses**

- `404`: الشركة غير موجودة
- `500`: خطأ أثناء معالجة المتابعة

## 5. إضافة Admin للشركة

**Endpoint**

`POST /api/companies/:id/admins`

**Access**

Private. فقط مالك الشركة `owner` يمكنه إضافة Admin جديد.

**Path Params**

| الحقل | النوع | الوصف |
|---|---|---|
| `id` | `string` | معرف الشركة |

**Request Body**

| الحقل | النوع | مطلوب | الوصف |
|---|---|---:|---|
| `newAdminId` | `string` | نعم | معرف المستخدم المراد إضافته كمدير |

**Example Request**

```json
{
  "newAdminId": "user_id_2"
}
```

**Success Response**

`200 OK`

```json
{
  "success": true,
  "message": "تمت إضافة المدير بنجاح",
  "adminsCount": 2
}
```

**Error Responses**

- `404`: الشركة غير موجودة
- `404`: المستخدم المطلوب إضافته غير موجود
- `403`: المستخدم الحالي ليس مالك الشركة
- `400`: المستخدم مدير بالفعل
- `500`: خطأ أثناء إضافة المدير

## 6. جلب الشركات المعلقة

**Endpoint**

`GET /api/admin/companies/pending`

**Access**

Private/Admin

**Success Response**

`200 OK`

```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "_id": "company_id",
      "name": "MaxTec Group",
      "description": "شركة رائدة في تقديم الحلول البرمجية.",
      "industry": "تكنولوجيا المعلومات",
      "location": {
        "country": "فلسطين",
        "city": "رام الله",
        "street": "شارع الملك عبدالله",
        "buildingNumber": "15",
        "coordinates": {
          "type": "Point",
          "coordinates": [35.2034, 31.8996]
        }
      },
      "companySize": "11-50",
      "foundedYear": 2020,
      "logo": "default-company-logo.png",
      "coverPhoto": "default-company-cover.png",
      "website": "https://maxtec.example.com",
      "socialLinks": {
        "linkedin": "https://linkedin.com/company/maxtec",
        "twitter": "https://twitter.com/maxtec"
      },
      "contactEmail": "info@maxtec.com",
      "isVerified": false,
      "status": "Pending",
      "owner": {
        "_id": "user_id",
        "email": "owner@example.com",
        "profile": {
          "firstName": "Ahmad",
          "lastName": "Ali"
        }
      },
      "admins": ["user_id"],
      "followers": [],
      "followersCount": 0,
      "createdAt": "2026-03-24T00:00:00.000Z",
      "updatedAt": "2026-03-24T00:00:00.000Z",
      "__v": 0
    }
  ]
}
```

**Error Responses**

- `500`: خطأ أثناء جلب الشركات المعلقة

## 7. تحديث حالة الشركة

**Endpoint**

`PUT /api/admin/companies/:id/status`

**Access**

Private/Admin

**Path Params**

| الحقل | النوع | الوصف |
|---|---|---|
| `id` | `string` | معرف الشركة |

**Request Body**

| الحقل | النوع | مطلوب | القيم المسموحة |
|---|---|---:|---|
| `status` | `string` | نعم | `Approved`, `Rejected` |

**Example Request**

```json
{
  "status": "Approved"
}
```

**Success Response**

`200 OK`

```json
{
  "success": true,
  "message": "تم تغيير حالة الشركة إلى Approved",
  "data": {
    "_id": "company_id",
    "name": "MaxTec Group",
    "status": "Approved",
    "isVerified": true,
    "owner": "user_id",
    "admins": ["user_id"],
    "followers": [],
    "followersCount": 0,
    "createdAt": "2026-03-24T00:00:00.000Z",
    "updatedAt": "2026-03-24T00:00:00.000Z"
  }
}
```

إذا كانت القيمة:

```json
{
  "status": "Rejected"
}
```

فستصبح `status = "Rejected"`، بينما `isVerified` لن يتم ضبطه إلى `true`.

**Error Responses**

- `400`: قيمة `status` يجب أن تكون `Approved` أو `Rejected`
- `404`: الشركة غير موجودة
- `500`: خطأ أثناء تحديث حالة الشركة

## الهيكل الفعلي لـ Company

الهيكل المؤكد من [Company.js](/home/amen/سطح المكتب/ProfitConectBackEnd/src/models/Company.js):

```json
{
  "_id": "string",
  "name": "string",
  "description": "string",
  "industry": "string",
  "location": {
    "country": "string",
    "city": "string",
    "street": "string",
    "buildingNumber": "string",
    "coordinates": {
      "type": "Point",
      "coordinates": ["number", "number"]
    }
  },
  "companySize": "1-10 | 11-50 | 51-200 | 201-500 | 501-1000 | 1000+",
  "foundedYear": "number",
  "logo": "string",
  "coverPhoto": "string",
  "website": "string",
  "socialLinks": {
    "linkedin": "string",
    "twitter": "string"
  },
  "contactEmail": "string",
  "isVerified": "boolean",
  "status": "Pending | Approved | Rejected",
  "owner": "ObjectId | populated user object",
  "admins": ["ObjectId"],
  "followers": ["ObjectId"],
  "followersCount": "number",
  "createdAt": "date",
  "updatedAt": "date"
}
```
