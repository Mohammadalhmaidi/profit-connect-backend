const User = require('../models/User');
const Post = require('../models/Post');
const Company = require('../models/Company');
const { buildAvatarUrl, deleteAvatarFile } = require('../utils/avatarStorage');
const { formatUserResponse } = require('../utils/userResponse');
const RScoreService = require('../services/rScoreService');
const { evaluateProfileCompletion } = require('../services/profileScoreService');
const { validatePassword } = require('../utils/passwordPolicy');
// @desc    الحصول على بيانات الملف الشخصي للمستخدم الحالي
// @route   GET /api/user/profile
// @access  Private (يحتاج توكن)
exports.getUserProfile = async (req, res) => {
  try {
    // بفضل حارس البوابة (authMiddleware)، أصبح لدينا الآن req.user جاهزاً!
    // الحارس قام بالفعل بالبحث عن المستخدم في قاعدة البيانات ووضعه هنا.
    const user = await User.findById(req.user._id).select('-password');

    const posts = await Post.find({ user: user._id })
      .sort({ createdAt: -1 })
      .populate('user', 'profile.firstName profile.lastName profile.headline profile.avatar')
      .populate({ path: 'comments.user', select: 'profile.firstName profile.lastName profile.avatar' })
      .lean();

    // إرفاق البوستات داخل كائن المستخدم كي يأخذها formatUserResponse
    const userWithPosts = user.toObject();
    userWithPosts.posts = posts;

    // جلب بيانات الشركة إن كان المستخدم صاحب عمل/مشروع حر
    const isEmployerType = user.role === 'Employer' || user.role === 'FreelanceClient';
    if (isEmployerType) {
      const company = await Company.findOne({ owner: user._id })
        .select('name description industry location companySize foundedYear logo coverPhoto website socialLinks contactEmail isVerified status followersCount averageRating createdAt');
      if (company) {
        userWithPosts.company = company.toObject();
      }
    }

    res.status(200).json({
      success: true,
      data: formatUserResponse(userWithPosts, { includePosts: true })
    });

  } catch (error) {
    console.error('Profile Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
  }
};


exports.updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

    // حفظ نسخة من البيانات القديمة قبل التعديل لمقارنتها لاحقاً
    const oldUser = user.toObject();

    const {
      firstName, lastName, bio, headline, location, phoneNumber,
      skills, industry, yearsOfExperience, socialLinks, birthDate, gender,
      companyName, companyDescription, companyIndustry, website, companySize, foundedYear,
    } = req.body;

    if (firstName !== undefined)  user.profile.firstName  = String(firstName).trim();
    if (lastName !== undefined)   user.profile.lastName   = String(lastName).trim();
    if (bio !== undefined)        user.profile.bio        = String(bio).trim();
    if (headline !== undefined)   user.profile.headline   = String(headline).trim();
    if (location !== undefined)   user.profile.location   = String(location).trim();
    if (phoneNumber !== undefined) user.profile.phoneNumber = String(phoneNumber).trim();
    if (birthDate !== undefined)  user.profile.birthDate  = String(birthDate).trim();
    if (gender !== undefined && ['male', 'female'].includes(gender)) {
      user.profile.gender = gender;
    }
    if (socialLinks !== undefined) {
      user.profile.socialLinks.linkedin = String(socialLinks.linkedin ?? '').trim();
      user.profile.socialLinks.github   = String(socialLinks.github ?? '').trim();
      user.profile.socialLinks.website  = String(socialLinks.website ?? '').trim();
    }
    if (skills !== undefined) {
      user.professional.skills = Array.isArray(skills)
        ? skills.map((s) => String(s).trim()).filter((s) => s.length > 0)
        : String(skills).split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    }
    if (industry !== undefined) user.professional.industry = String(industry).trim();
    if (yearsOfExperience !== undefined) user.professional.yearsOfExperience = Number(yearsOfExperience);

    if (user.role === 'Employer' || user.role === 'FreelanceClient') {
      if (companyName !== undefined) user.employerProfile.companyName = String(companyName).trim();
      if (companyDescription !== undefined) user.employerProfile.companyDescription = String(companyDescription).trim();
      if (companyIndustry !== undefined) user.employerProfile.industry = String(companyIndustry).trim();
      if (website !== undefined) user.employerProfile.website = String(website).trim();
      if (companySize !== undefined) user.employerProfile.companySize = String(companySize).trim();
      if (foundedYear !== undefined) user.employerProfile.foundedYear = Number(foundedYear);
    }

    const updatedUser = await user.save();

    // تقييم الملف الشخصي ومنح النقاط في الخلفية
    evaluateProfileCompletion(user._id, oldUser, updatedUser.toObject());

    res.status(200).json({ success: true, message: 'تم التحديث بنجاح', data: formatUserResponse(updatedUser) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تحديث البيانات' });
  }
};
// @desc    تحديث الصورة الشخصية للمستخدم الحالي
// @route   PUT /api/user/profile/avatar
// @access  Private (يحتاج توكن)
// @desc    تحديث الصورة الشخصية للمستخدم الحالي
exports.updateUserAvatar = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'يرجى رفع صورة' });

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

    const oldAvatar = user.profile.avatar;
    user.profile.avatar = buildAvatarUrl(req, req.file.filename);

    // 🌟 1. مكافأة رفع الصورة لأول مرة (ONCE)
    if (oldAvatar === 'default-avatar.png') {
       await RScoreService.applyScore(user._id, 'UPLOAD_AVATAR', 'مكافأة إكمال الملف الشخصي: صورة العرض');
       user.profile.rScore += 10; // تحديث فوري للرد
    }

    const updatedUser = await user.save();

    if (oldAvatar && oldAvatar !== updatedUser.profile.avatar) {
      await deleteAvatarFile(oldAvatar);
    }

    res.status(200).json({
      success: true,
      message: 'تم تحديث الصورة الشخصية بنجاح',
      data: { avatar: formatUserResponse(updatedUser).profile.avatar, user: formatUserResponse(updatedUser) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تحديث الصورة الشخصية' });
  }
};
// @desc    حذف حساب المستخدم الحالي نهائياً
// @route   DELETE /api/user/profile
// @access  Private (يحتاج توكن)
exports.deleteUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    }

    await deleteAvatarFile(user.profile?.avatar);
    await Post.deleteMany({ user: user._id });
    await user.deleteOne();

    res.status(200).json({
      success: true,
      message: 'تم حذف الحساب وبياناته بنجاح'
    });

  } catch (error) {
    console.error('Delete Profile Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء حذف الحساب' });
  }
};

// @desc    تغيير كلمة المرور
// @route   PUT /api/user/change-password
// @access  Private
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'كلمة المرور الحالية والجديدة مطلوبتان' });
    }

    const passwordCheck = validatePassword(newPassword);
    if (!passwordCheck.valid) {
      return res.status(400).json({ success: false, message: passwordCheck.message });
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    }

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'كلمة المرور الحالية غير صحيحة' });
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (error) {
    console.error('Change Password Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تغيير كلمة المرور' });
  }
};

// @desc    تصدير بيانات المستخدم
// @route   GET /api/user/export-data
// @access  Private
exports.exportData = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    const posts = await Post.find({ user: req.user._id }).sort({ createdAt: -1 }).lean();
    const postsCount = await Post.countDocuments({ user: req.user._id });
    const likesReceived = await Post.aggregate([
      { $match: { user: req.user._id } },
      { $project: { likesCount: { $size: '$likes' } } },
      { $group: { _id: null, total: { $sum: '$likesCount' } } },
    ]);
    const commentsCount = await Post.aggregate([
      { $match: { user: req.user._id } },
      { $project: { commentsCount: { $size: '$comments' } } },
      { $group: { _id: null, total: { $sum: '$commentsCount' } } },
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      account: {
        id: user._id,
        email: user.email,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt,
        status: user.status,
      },
      profile: user.profile,
      professional: user.professional,
      settings: user.settings,
      stats: {
        postsCount,
        totalLikesReceived: likesReceived[0]?.total || 0,
        totalCommentsOnPosts: commentsCount[0]?.total || 0,
      },
      posts,
    };

    res.status(200).json({ success: true, data: exportData });
  } catch (error) {
    console.error('Export Data Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تصدير البيانات' });
  }
};

// @desc    جلب إعدادات المستخدم
// @route   GET /api/user/settings
// @access  Private
exports.getSettings = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('settings');
    res.status(200).json({ success: true, data: user.settings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
  }
};

// @desc    تحديث إعدادات المستخدم
// @route   PUT /api/user/settings
// @access  Private
exports.updateSettings = async (req, res) => {
  try {
    const allowed = ['language', 'theme', 'emailNotifications', 'pushNotifications', 'profileVisibility', 'showEmail', 'showPhone', 'animationEnabled'];
    const updates = {};

    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[`settings.${key}`] = req.body[key];
    }

    if (!Object.keys(updates).length)
      return res.status(400).json({ success: false, message: 'لا توجد بيانات للتحديث' });

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    res.status(200).json({ success: true, message: 'تم تحديث الإعدادات بنجاح', data: user.settings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تحديث الإعدادات' });
  }
};

// @desc    متابعة / إلغاء متابعة مستخدم (Toggle)
// @route   POST /api/user/:userId/follow
// @access  Private
exports.toggleFollow = async (req, res) => {
  try {
    const targetId = req.params.userId;
    const currentId = req.user._id.toString();

    if (targetId === currentId)
      return res.status(400).json({ success: false, message: 'لا يمكنك متابعة نفسك' });

    const target = await User.findById(targetId);
    if (!target) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

    const isFollowing = target.profile.followers.map(id => id.toString()).includes(currentId);

    if (isFollowing) {
      // إلغاء المتابعة
      await User.findByIdAndUpdate(targetId,  { $pull: { 'profile.followers': currentId }, $inc: { 'profile.followersCount': -1 } });
      await User.findByIdAndUpdate(currentId, { $pull: { 'profile.following': targetId },  $inc: { 'profile.followingCount': -1 } });
      return res.status(200).json({ success: true, following: false, message: 'تم إلغاء المتابعة' });
    } else {
      // متابعة
      await User.findByIdAndUpdate(targetId,  { $addToSet: { 'profile.followers': currentId }, $inc: { 'profile.followersCount': 1 } });
      await User.findByIdAndUpdate(currentId, { $addToSet: { 'profile.following': targetId },  $inc: { 'profile.followingCount': 1 } });

      // إشعار للمتابَع: شخص جديد يتابعه
      const followerName = `${req.user.profile.firstName} ${req.user.profile.lastName}`.trim();
      await User.findByIdAndUpdate(targetId, {
        $push: {
          notifications: {
            type: 'follow',
            senderId: currentId,
            message: `بدأ ${followerName} بمتابعتك`,
            read: false,
          },
        },
      });

      return res.status(200).json({ success: true, following: true, message: 'تمت المتابعة بنجاح' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء المتابعة' });
  }
};

// @desc    جلب قائمة متابعي مستخدم
// @route   GET /api/user/:userId/followers
// @access  Private
exports.getFollowers = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('profile.followers profile.followersCount')
      .populate('profile.followers', 'profile.firstName profile.lastName profile.avatar profile.headline');
    if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    const followers = (user.profile.followers || []).filter(Boolean);
    res.status(200).json({ success: true, count: user.profile.followersCount, data: followers });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
  }
};

// @desc    جلب قائمة المتابَعين من قِبل مستخدم
// @route   GET /api/user/:userId/following
// @access  Private
exports.getFollowing = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('profile.following profile.followingCount')
      .populate('profile.following', 'profile.firstName profile.lastName profile.avatar profile.headline');
    if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    const following = (user.profile.following || []).filter(Boolean);
    res.status(200).json({ success: true, count: user.profile.followingCount, data: following });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
  }
};

// @desc    الحصول على بيانات مستخدم آخر بواسطة الـ ID
// @route   GET /api/user/:userId
// @access  Private (يحتاج توكن)
exports.getUserById = async (req, res) => {
  try {
    // نجلب المستخدم ونستبعد كلمة المرور
    const user = await User.findById(req.params.userId).select('-password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    }

    // هل أتابع هذا المستخدم؟
    const me = await User.findById(req.user._id).select('profile.following').lean();
    const isFollowing = (me && me.profile && me.profile.following || [])
      .some((id) => id.toString() === req.params.userId);
    const isOwnProfile = req.user._id.toString() === user._id.toString();

    // منشورات هذا المستخدم (لتظهر في صفحة ملفه)
    const posts = await Post.find({ user: user._id })
      .sort({ createdAt: -1 })
      .limit(parseInt(req.query.postsLimit) || 50)
      .populate('user', 'role profile.firstName profile.lastName profile.fullname profile.headline profile.avatar')
      .populate({ path: 'comments.user', select: '_id role profile.firstName profile.lastName profile.fullname profile.avatar' })
      .lean();

    const data = formatUserResponse(user, { includeSettings: isOwnProfile });
    data.isFollowing = isFollowing;
    data.postsCount = user.profile.postsCount || posts.length;
    data.followersCount = user.profile.followersCount || 0;
    data.followingCount = user.profile.followingCount || 0;
    data.posts = posts;

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Get User By Id Error:', error.message);
    // معالجة خطأ كتابة ID بصيغة غير صحيحة
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    }
    res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
  }
};

// @desc    جلب نقاط السمعة (r-score)
// @route   GET /api/user/reputation-score
// @access  Private
// @desc    حفظ منشور
// @route   POST /api/user/saved-posts/:postId
// @access  Private
exports.savePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ success: false, message: 'المنشور غير موجود' });

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $addToSet: { savedPosts: req.params.postId } },
      { new: true }
    );

    if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

    res.status(200).json({ success: true, message: 'تم حفظ المنشور بنجاح' });
  } catch (error) {
    console.error('Save Post Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء حفظ المنشور' });
  }
};

// @desc    إلغاء حفظ منشور
// @route   DELETE /api/user/saved-posts/:postId
// @access  Private
exports.unsavePost = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $pull: { savedPosts: req.params.postId } },
      { new: true }
    );

    if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

    res.status(200).json({ success: true, message: 'تم إلغاء حفظ المنشور بنجاح' });
  } catch (error) {
    console.error('Unsave Post Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء إلغاء حفظ المنشور' });
  }
};

// @desc    جلب المنشورات المحفوظة
// @route   GET /api/user/saved-posts
// @access  Private
exports.getSavedPosts = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate({
      path: 'savedPosts',
      populate: { path: 'user', select: 'profile.firstName profile.lastName profile.headline profile.avatar' }
    });

    res.status(200).json({ success: true, count: user.savedPosts.length, data: user.savedPosts });
  } catch (error) {
    console.error('Get Saved Posts Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب المنشورات المحفوظة' });
  }
};

exports.getReputationScore = async (req, res) => {
  try {
    const { score, level } = await RScoreService.getUserScoreDetails(req.user._id);
    res.status(200).json({ success: true, data: { score, level } });
  } catch (error) {
    console.error('Get Reputation Score Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب نقاط السمعة' });
  }
};

// @desc    جلب أفضل المستخدمين حسب نقاط السمعة (r-score)
// @route   GET /api/user/leaderboard/top-users
// @access  Public (متاح للجميع)
exports.getTopUsers = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const role = req.query.role;

    const filter = { status: 'active' };
    if (role && ['Employer', 'JobSeeker', 'FreelanceClient'].includes(role)) {
      filter.role = role;
    }

    const users = await User.find(filter)
      .select('username role profile.firstName profile.lastName profile.fullname profile.gender profile.avatar profile.headline profile.bio profile.location profile.followersCount profile.followingCount profile.postsCount profile.rScore professional.industry professional.yearsOfExperience professional.skills createdAt')
      .sort({ 'profile.rScore': -1 })
      .limit(limit);

    res.status(200).json({
      success: true,
      count: users.length,
      data: users.map(user => ({
        _id: user._id,
        username: user.username,
        role: user.role,
        profile: user.profile,
        professional: user.professional,
        createdAt: user.createdAt
      }))
    });
  } catch (error) {
    console.error('Get Top Users Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب أفضل المستخدمين' });
  }
};
