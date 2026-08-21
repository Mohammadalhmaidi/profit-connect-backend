const Salary = require('../models/Salary'); // تأكد من مسار الموديل الخاص بك
const { escapeRegex } = require('../utils/regex');

// @desc    Get all salaries with filtering and pagination
// @route   GET /api/salaries
// @access  Public
exports.getSalaries = async (req, res) => {
    try {
        // 1. استخراج فلاتر البحث من الرابط (Query Parameters)
        const { 
            title, 
            country, 
            experienceLevel, 
            category,
            page = 1, // الصفحة الافتراضية الأولى
            limit = 20 // عدد النتائج الافتراضي في كل صفحة (يمكنك تغييره)
        } = req.query;

        // 2. بناء كائن البحث (Query Object)
        let query = {};

        // البحث بجزء من النص (حالة الأحرف غير حساسة - Case Insensitive)
        if (title) query.title = { $regex: escapeRegex(title), $options: 'i' };
        if (country) query.country = { $regex: escapeRegex(country), $options: 'i' };
        if (category) query.category = { $regex: escapeRegex(category), $options: 'i' };
        
        // البحث المطابق تماماً
        if (experienceLevel) query.experienceLevel = experienceLevel;

        // 3. حساب تخطي الصفحات (Pagination logic)
        const safePage = Math.max(parseInt(page, 10) || 1, 1);
        const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
        const skip = (safePage - 1) * safeLimit;

        // 4. جلب البيانات من قاعدة البيانات
        const salaries = await Salary.find(query)
            .skip(skip)
            .limit(safeLimit)
            .sort({ medianSalaryUSD: -1 }); // ترتيب تنازلي حسب متوسط الراتب (اختياري)

        // 5. حساب العدد الكلي للنتائج (مفيد لعرض أرقام الصفحات في الـ Frontend)
        const total = await Salary.countDocuments(query);

        // 6. إرسال الاستجابة (Response)
        res.status(200).json({
            success: true,
            count: salaries.length,
            pagination: {
                totalRecords: total,
                currentPage: safePage,
                totalPages: Math.ceil(total / safeLimit)
            },
            data: salaries
        });

    } catch (error) {
        console.error('Error fetching salaries:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء جلب البيانات'
        });
    }
};

// @desc    Get distinct options for filters (Countries, Titles, Categories)
// @route   GET /api/salaries/options
// @access  Public
exports.getSalaryOptions = async (req, res) => {
    try {
        // نستخدم distinct لجلب القيم الفريدة بدون تكرار
        const titles = await Salary.distinct('title');
        const countries = await Salary.distinct('country');
        const categories = await Salary.distinct('category');
        const experienceLevels = await Salary.distinct('experienceLevel');

        res.status(200).json({
            success: true,
            data: {
                titles: titles.sort(), // ترتيب أبجدي
                countries: countries.sort(),
                categories: categories.sort(),
                experienceLevels
            }
        });
    } catch (error) {
        console.error('Error fetching options:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء جلب خيارات الفلترة'
        });
    }
};

// @desc    Get salary statistics (e.g., average by country or role)
// @route   GET /api/salaries/stats
// @access  Public
exports.getSalaryStats = async (req, res) => {
    try {
        const { title, country } = req.query;
        let matchStage = {};

        // إذا أرسل المستخدم مسمى وظيفي أو دولة، نفلتر الإحصائيات بناءً عليها
        if (title) matchStage.title = { $regex: escapeRegex(title), $options: 'i' };
        if (country) matchStage.country = { $regex: escapeRegex(country), $options: 'i' };

        const stats = await Salary.aggregate([
            { $match: matchStage }, // تصفية البيانات أولاً
            {
                $group: {
                    _id: title ? "$country" : "$title", // التجميع حسب الدولة إذا كان يبحث عن وظيفة، والعكس
                    averageMin: { $avg: "$minSalaryUSD" },
                    averageMax: { $avg: "$maxSalaryUSD" },
                    averageMedian: { $avg: "$medianSalaryUSD" },
                    totalRecords: { $sum: 1 }
                }
            },
            { $sort: { averageMedian: -1 } } // ترتيب تنازلي حسب متوسط الراتب
        ]);

        res.status(200).json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء حساب الإحصائيات'
        });
    }
};