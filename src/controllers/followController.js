
const User = require('../models/User');
const asyncHandler = require('express-async-handler');

// @desc    Follow a user
// @route   POST /api/users/:userId/follow
// @access  Private
exports.followUser = asyncHandler(async (req, res) => {
  const userIdToFollow = req.params.userId;
  const currentUserId = req.user.id;

  if (userIdToFollow === currentUserId) {
    res.status(400);
    throw new Error('لا يمكنك متابعة نفسك');
  }

  const userToFollow = await User.findById(userIdToFollow);
  const currentUser = await User.findById(currentUserId);

  if (!userToFollow || !currentUser) {
    res.status(404);
    throw new Error('المستخدم غير موجود');
  }

  // Check if already following
  if (currentUser.profile.following.includes(userIdToFollow)) {
    res.status(400);
    throw new Error('أنت تتابع هذا المستخدم بالفعل');
  }

  // Add to following and followers lists
  currentUser.profile.following.push(userIdToFollow);
  userToFollow.profile.followers.push(currentUserId);

  // Update counts
  currentUser.profile.followingCount = currentUser.profile.following.length;
  userToFollow.profile.followersCount = userToFollow.profile.followers.length;

  await currentUser.save();
  await userToFollow.save();

  // إشعار للمتابَع: شخص جديد يتابعه
  const followerName = `${currentUser.profile.firstName} ${currentUser.profile.lastName}`.trim();
  await User.findByIdAndUpdate(userIdToFollow, {
    $push: {
      notifications: {
        type: 'follow',
        senderId: currentUserId,
        message: `بدأ ${followerName} بمتابعتك`,
        read: false,
      },
    },
  });

  res.status(200).json({
    success: true,
    message: 'تمت متابعة المستخدم بنجاح',
  });
});

// @desc    Unfollow a user
// @route   DELETE /api/users/:userId/follow
// @access  Private
exports.unfollowUser = asyncHandler(async (req, res) => {
  const userIdToUnfollow = req.params.userId;
  const currentUserId = req.user.id;

  const userToUnfollow = await User.findById(userIdToUnfollow);
  const currentUser = await User.findById(currentUserId);

  if (!userToUnfollow || !currentUser) {
    res.status(404);
    throw new Error('المستخدم غير موجود');
  }

  // Remove from following and followers lists
  currentUser.profile.following = currentUser.profile.following.filter(
    (id) => id.toString() !== userIdToUnfollow
  );
  userToUnfollow.profile.followers = userToUnfollow.profile.followers.filter(
    (id) => id.toString() !== currentUserId
  );

  // Update counts
  currentUser.profile.followingCount = currentUser.profile.following.length;
  userToUnfollow.profile.followersCount = userToUnfollow.profile.followers.length;
  
  await currentUser.save();
  await userToUnfollow.save();

  res.status(200).json({
    success: true,
    message: 'تم إلغاء متابعة المستخدم بنجاح',
  });
});
