const Post = require('../models/Post');
const User = require('../models/User');
const RScoreService = require('../services/rScoreService');
const { processDynamicScoring, evaluateContent } = require('../services/aiEvaluationService');
const aiDetector = require('../middleware/aiDetector');
const { applyWarning } = require('../services/moderationService');
const { buildPostImageUrl, deletePostImage, buildPostVideoUrl, deletePostVideo } = require('../utils/postImageStorage');
const { sanitizePostContent } = require('../utils/sanitizeContent');

function senderName(user) {
  return user?.profile?.fullname || user?.username || 'مستخدم';
}

async function pushPostNotification(userId, payload) {
  if (!userId) return;
  try {
    await User.findByIdAndUpdate(userId, { $push: { notifications: { read: false, ...payload } } });
  } catch (e) {
    console.error('[Post Notification Error]:', e.message);
  }
}

// @desc    إنشاء منشور جديد
// @route   POST /api/posts
// @access  Private (يحتاج توكن)
exports.createPost = async (req, res) => {
 try {
    const { content, visibility } = req.body;
    const sanitizedContent = sanitizePostContent(content);
    const files = req.files || {};
    const image = files.image?.[0] ? buildPostImageUrl(req, files.image[0].filename) : null;
    const video = files.video?.[0] ? buildPostVideoUrl(req, files.video[0].filename) : null;
    const newPost = await Post.create({ user: req.user._id, content: sanitizedContent, image, video, visibility });

    // زيادة عداد المنشورات للمستخدم
    await User.findByIdAndUpdate(req.user._id, { $inc: { 'profile.postsCount': 1 } });

    // 🤖 تقييم المنشور بالذكاء في الخلفية
    if (content) {
      setImmediate(async () => {
        try {
          const score = await evaluateContent(content);
          if (score === -1) {
            await Post.findByIdAndDelete(newPost._id);
            await User.findByIdAndUpdate(req.user._id, { $inc: { 'profile.postsCount': -1 } });
            await applyWarning(req.user._id, content, 'محتوى منشور غير لائق');
            return;
          } else if (score > 0) {
            await RScoreService.applyScore(req.user._id, 'CREATE_POST', `جودة المنشور: ${score} نقاط`, score);
          }

          // تقدير نسبة الذكاء الاصطناعي في المحتوى (الطبقات الدفاعية + النموذج المحلي)
          const analysis = await aiDetector.run(content);
          await Post.findByIdAndUpdate(newPost._id, {
            $set: { aiProbability: analysis.probability, aiDetails: analysis }
          });

          // إشعار عند تجاوز احتمال الذكاء الاصطناعي 50%
          if (analysis.probability > 50) {
            await User.findByIdAndUpdate(req.user._id, {
              $push: {
                notifications: {
                  type: 'ai_detected',
                  postId: newPost._id,
                  aiProbability: analysis.probability,
                  message: `تم رصد أن منشورك يحتمل أن يكون مولّداً بالذكاء الاصطناعي بنسبة ${analysis.probability}%`,
                  read: false
                }
              }
            });
          }
        } catch (e) {
          console.error('[Post AI Error]:', e.message);
        }
      });
    }

    const populatedPost = await Post.findById(newPost._id).populate('user', 'profile.firstName profile.lastName profile.headline profile.avatar');
    res.status(201).json({ success: true, data: populatedPost });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء إنشاء المنشور' });
  }
};

// @desc    الحصول على جميع المنشورات (مع دعم الصفحات Pagination)
// @route   GET /api/posts
// @access  Private
exports.getPosts = async (req, res) => {
  try {
    // إعدادات الصفحات (Pagination) كما طلبت في التوثيق
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // الخلاصة (Feed): منشورات المستخدم نفسه + منشورات من يتابعهم فقط
    const me = await User.findById(req.user._id).select('profile.following').lean();
    const following = (me && me.profile && me.profile.following || [])
      .map((id) => id.toString());
    const authors = [...following, req.user._id.toString()];
    const filter = { user: { $in: authors } };

    // جلب المنشورات وترتيبها من الأحدث للأقدم
    const posts = await Post.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'role profile.firstName profile.lastName profile.fullname profile.headline profile.avatar')
      .populate({ path: 'comments.user', select: '_id role profile.firstName profile.lastName profile.fullname profile.avatar' })
      .lean()

    const user = await User.findById(req.user._id).select('savedPosts').lean();
    const savedSet = new Set((user?.savedPosts || []).map(String));
    posts.forEach((post) => {
      post.isSaved = savedSet.has(String(post._id));
    });

    // جلب العدد الكلي للمنشورات لحساب عدد الصفحات
    const total = await Post.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: posts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get Posts Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب المنشورات' });
  }
};

// @desc    الحصول على منشور محدد (للمشاركة)
// @route   GET /api/posts/:postId
// @access  Private
exports.getPost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId)
      .populate('user', 'role profile.firstName profile.lastName profile.fullname profile.headline profile.avatar')
      .populate({ path: 'comments.user', select: '_id role profile.firstName profile.lastName profile.fullname profile.avatar' })
      .lean();

    if (!post) {
      return res.status(404).json({ success: false, message: 'المنشور غير موجود' });
    }

    const user = await User.findById(req.user._id).select('savedPosts').lean();
    const savedSet = new Set((user?.savedPosts || []).map(String));
    post.isSaved = savedSet.has(String(post._id));

    res.status(200).json({ success: true, data: post });
  } catch (error) {
    console.error('Get Post Error:', error.message);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ success: false, message: 'المنشور غير موجود' });
    }
    res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
  }
};

// @desc    تسجيل إعجاب / إلغاء إعجاب بمنشور (Toggle Like)
// @route   POST /api/posts/:postId/like
// @access  Private
// @desc    تسجيل إعجاب / إلغاء إعجاب بمنشور (Toggle Like)
exports.toggleLike = async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ success: false, message: 'المنشور غير موجود' });

    const index = post.likes.indexOf(req.user._id);
    let isLiked = false;

    if (index === -1) {
      post.likes.push(req.user._id);
      isLiked = true;

      // إشعار لصاحب المنشور بأن شخصاً أعجب بمنشوره
      if (post.user.toString() !== req.user._id.toString()) {
        await pushPostNotification(post.user.toString(), {
          type: 'post_liked',
          postId: post._id,
          senderId: req.user._id,
          message: `أعجب ${senderName(req.user)} بمنشورك`
        });
      }

      // 🌟 3. مكافأة "صاحب المنشور" لأنه حصل على إعجاب جديد (التفاعل الإيجابي)
      // نتأكد أن المستخدم لا يعطي إعجاب لنفسه لتجنب الغش
      if (post.user.toString() !== req.user._id.toString()) {
        await RScoreService.applyScore(post.user.toString(), 'RECEIVE_LIKE', 'حصلت على إعجاب جديد على منشورك');
      }
      
    } else {
      post.likes.splice(index, 1);
    }

    await post.save();
    res.status(200).json({ success: true, isLiked, likesCount: post.likes.length });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء معالجة الإعجاب' });
  }
};
// @desc    إضافة تعليق على منشور
// @route   POST /api/posts/:postId/comments
// @access  Private
exports.addComment = async (req, res) => {
  try {
    const { content } = req.body;
    console.log('[AddComment Debug] req.body:', req.body);
    console.log('[AddComment Debug] req.params.postId:', req.params.postId);
    console.log('[AddComment Debug] content value:', content);

    if (!content) {
      return res.status(400).json({ success: false, message: 'محتوى التعليق مطلوب' });
    }

    const post = await Post.findById(req.params.postId);

    if (!post) {
      return res.status(404).json({ success: false, message: 'المنشور غير موجود' });
    }

    // تجهيز كائن التعليق الجديد
    const newComment = {
      user: req.user._id,
      content
    };


    // إضافة التعليق إلى مصفوفة التعليقات في المنشور (في النهاية أو البداية باستخدام unshift)
    post.comments.push(newComment);

    await post.save();
    const savedComment = post.comments[post.comments.length - 1];
    console.log('[AddComment Debug] Saved comment content:', savedComment?.content, '| Post ID:', post._id);

    // إشعار لصاحب المنشور بوجود تعليق جديد
    if (post.user.toString() !== req.user._id.toString()) {
      await pushPostNotification(post.user.toString(), {
        type: 'comment_added',
        postId: post._id,
        senderId: req.user._id,
        message: `علّق ${senderName(req.user)} على منشورك: ${content.slice(0, 60)}`
      });
    }


    // 🤖 تقييم التعليق بالذكاء في الخلفية
    const addedComment = post.comments[post.comments.length - 1];
    setImmediate(async () => {
      try {
        const score = await evaluateContent(content);
        if (score === -1) {
          await Post.findByIdAndUpdate(req.params.postId, {
            $pull: { comments: { _id: addedComment._id } }
          });
          await applyWarning(req.user._id, content, 'تعليق غير لائق');
        } else if (score > 0) {
          await RScoreService.applyScore(req.user._id, 'ADD_COMMENT', `جودة التعليق: ${score} نقاط`, score);
        }
      } catch (e) {
        console.error('[Comment AI Error]:', e.message);
      }
    });

    res.status(201).json({
      success: true,
      message: 'تمت إضافة التعليق بنجاح',
      commentsCount: post.comments.length,
      username: req.user.username,
      fullname: req.user.profile.fullname,
      avatar: req.user.profile.avatar
    });
  } catch (error) {
    console.error('Comment Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء إضافة التعليق' });
  }
};
// @desc    تعديل منشور
// @route   PUT /api/posts/:postId
// @access  Private
exports.updatePost = async (req, res) => {
  try {
    let post = await Post.findById(req.params.postId);

    if (!post) {
      return res.status(404).json({ success: false, message: 'المنشور غير موجود' });
    }

    // 🔒 التأكد من أن المستخدم الحالي هو نفسه صاحب المنشور
    if (post.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'غير مصرح لك بتعديل هذا المنشور' });
    }

    const files = req.files || {};

    if (files.image?.[0]) {
      await deletePostImage(post.image);
    }
    if (files.video?.[0]) {
      await deletePostVideo(post.video);
    }

    const image = files.image?.[0] ? buildPostImageUrl(req, files.image[0].filename) : req.body.image;
    const video = files.video?.[0] ? buildPostVideoUrl(req, files.video[0].filename) : req.body.video;
    const sanitizedContent = sanitizePostContent(req.body.content);
    post = await Post.findByIdAndUpdate(
      req.params.postId,
      { $set: { content: sanitizedContent, image, video, visibility: req.body.visibility } },
      { new: true, runValidators: true }
    ).populate('user', 'profile.firstName profile.lastName profile.avatar');

    // 🤖 تقدير نسبة الذكاء الاصطناعي في الخلفية عند التعديل
    if (req.body.content) {
      setImmediate(async () => {
        try {
          const analysis = await aiDetector.run(req.body.content);
          await Post.findByIdAndUpdate(req.params.postId, {
            $set: { aiProbability: analysis.probability, aiDetails: analysis }
          });

          // إشعار عند تجاوز احتمال الذكاء الاصطناعي 50%
          if (analysis.probability > 50) {
            await User.findByIdAndUpdate(req.user._id, {
              $push: {
                notifications: {
                  type: 'ai_detected',
                  postId: req.params.postId,
                  aiProbability: analysis.probability,
                  message: `تم رصد أن منشورك يحتمل أن يكون مولّداً بالذكاء الاصطناعي بنسبة ${analysis.probability}%`,
                  read: false
                }
              }
            });
          }
        } catch (e) {
          console.error('[Post AI Detect Error]:', e.message);
        }
      });
    }

    res.status(200).json({ success: true, data: post });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تعديل المنشور' });
  }
};

// @desc    حذف منشور
// @route   DELETE /api/posts/:postId
// @access  Private
exports.deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);

    if (!post) {
      return res.status(404).json({ success: false, message: 'المنشور غير موجود' });
    }

    // 🔒 التأكد من أن المستخدم الحالي هو صاحب المنشور
    if (post.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'غير مصرح لك بحذف هذا المنشور' });
    }

    await deletePostImage(post.image);
    await deletePostVideo(post.video);
    await User.findByIdAndUpdate(req.user._id, { $inc: { 'profile.postsCount': -1 } });
    await post.deleteOne();

    res.status(200).json({ success: true, message: 'تم حذف المنشور بنجاح' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء حذف المنشور' });
  }
};

// @desc    حذف تعليق
// @route   DELETE /api/posts/:postId/comments/:commentId
// @access  Private
exports.deleteComment = async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);

    if (!post) {
      return res.status(404).json({ success: false, message: 'المنشور غير موجود' });
    }

    // البحث عن التعليق داخل مصفوفة التعليقات
    const comment = post.comments.find(c => c._id.toString() === req.params.commentId);

    if (!comment) {
      return res.status(404).json({ success: false, message: 'التعليق غير موجود' });
    }

    // 🔒 التحقق من الصلاحيات: يُسمح بحذف التعليق إذا كان المستخدم هو (صاحب التعليق) أو (صاحب المنشور نفسه)
    if (
      comment.user.toString() !== req.user._id.toString() && 
      post.user.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ success: false, message: 'غير مصرح لك بحذف هذا التعليق' });
    }

    // إزالة التعليق من المصفوفة باستخدام دالة filter
    post.comments = post.comments.filter(c => c._id.toString() !== req.params.commentId);

    await post.save();

    res.status(200).json({ 
      success: true, 
      message: 'تم حذف التعليق بنجاح', 
      commentsCount: post.comments.length 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء حذف التعليق' });
  }
};

// @desc    تسجيل نسخ/مشاركة رابط المنشور (زيادة العداد)
// @route   POST /api/posts/:postId/share
// @access  Private
exports.sharePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ success: false, message: 'المنشور غير موجود' });

    const alreadyShared = (post.sharedBy || []).some(
      (id) => id.toString() === req.user._id.toString()
    );
    if (alreadyShared) {
      return res.status(200).json({
        success: true,
        shareCount: post.shareCount,
        alreadyShared: true,
      });
    }

    post.sharedBy.push(req.user._id);
    post.shareCount += 1;
    await post.save();

    // إشعار لصاحب المنشور عند مشاركة منشوره (عدا نفسه)
    if (post.user.toString() !== req.user._id.toString()) {
      await pushPostNotification(post.user.toString(), {
        type: 'post_shared',
        postId: post._id,
        senderId: req.user._id,
        message: `شارك ${senderName(req.user)} منشورك`
      });
    }

    res.status(200).json({ success: true, shareCount: post.shareCount });
  } catch (error) {
    console.error('Share Post Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء مشاركة المنشور' });
  }
};

// @desc    تسجيل إعجاب / إلغاء إعجاب بتعليق (Toggle Comment Like)
// @route   POST /api/posts/:postId/comments/:commentId/like
// @access  Private
exports.toggleCommentLike = async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ success: false, message: 'المنشور غير موجود' });

    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ success: false, message: 'التعليق غير موجود' });

    const index = (comment.likes || []).indexOf(req.user._id);
    let isLiked = false;

    if (index === -1) {
      comment.likes.push(req.user._id);
      isLiked = true;

      // إشعار لصاحب التعليق بإعجاب جديد على تعليقه
      if (comment.user.toString() !== req.user._id.toString()) {
        await pushPostNotification(comment.user.toString(), {
          type: 'comment_liked',
          postId: post._id,
          senderId: req.user._id,
          message: `أعجب ${senderName(req.user)} بتعليقك`
        });
      }
    } else {
      comment.likes.splice(index, 1);
    }

    await post.save();

    res.status(200).json({
      success: true,
      isLiked,
      likesCount: comment.likes.length
    });
  } catch (error) {
    console.error('Comment Like Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء معالجة إعجاب التعليق' });
  }
};