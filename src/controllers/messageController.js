const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

// @desc   بدء أو جلب محادثة مع مستخدم آخر
// @route  POST /api/messages/conversations
// @access Private
exports.getOrCreateConversation = async (req, res) => {
  try {
    const { recipientId } = req.body;
    const userId = req.user._id.toString();

    if (!recipientId) return res.status(400).json({ success: false, message: 'معرف المستقبل مطلوب' });
    if (recipientId === userId) return res.status(400).json({ success: false, message: 'لا يمكنك مراسلة نفسك' });

    // البحث عن محادثة موجودة بين المستخدمين
    let conversation = await Conversation.findOne({
      participants: { $all: [userId, recipientId], $size: 2 }
    }).populate('participants', 'profile.firstName profile.lastName profile.avatar')
      .populate('lastMessage');

    if (!conversation) {
      conversation = await Conversation.create({ participants: [userId, recipientId] });
      conversation = await conversation.populate('participants', 'profile.firstName profile.lastName profile.avatar');
    }

    res.status(200).json({ success: true, data: conversation });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء إنشاء المحادثة' });
  }
};

// @desc   جلب جميع محادثات المستخدم الحالي
// @route  GET /api/messages/conversations
// @access Private
exports.getMyConversations = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const cap = Math.min(parseInt(req.query.limit) || 100, 200);
    const baseQuery = Conversation.find({ participants: req.user._id })
      .sort({ lastMessageAt: -1 })
      .limit(cap)
      .populate('participants', 'profile.firstName profile.lastName profile.avatar')
      .populate('lastMessage');

    const conversations = await baseQuery;

    // فلترة باسم الطرف الآخر أو بمحتوى آخر رسالة عند البحث (q)
    const list = q
      ? conversations.filter((c) => {
          const peer = (c.participants || []).find(
            (p) => p && p._id && p._id.toString() !== req.user._id.toString()
          );
          const name = peer && peer.profile
            ? `${peer.profile.firstName || ''} ${peer.profile.lastName || ''}`.trim()
            : '';
          const lastMsg = (c.lastMessage && c.lastMessage.content) || '';
          const needle = q.toLowerCase();
          return name.toLowerCase().includes(needle) || lastMsg.toLowerCase().includes(needle);
        })
      : conversations;

    res.status(200).json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب المحادثات' });
  }
};

// @desc   جلب رسائل محادثة معينة
// @route  GET /api/messages/conversations/:conversationId
// @access Private
exports.getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;

    // التأكد أن المستخدم طرف في المحادثة
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: req.user._id
    });
    if (!conversation) return res.status(403).json({ success: false, message: 'غير مصرح لك بالوصول لهذه المحادثة' });

    const messages = await Message.find({ conversation: conversationId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('sender', 'profile.firstName profile.lastName profile.avatar');

    // تحديث حالة القراءة للرسائل الواردة
    await Message.updateMany(
      { conversation: conversationId, sender: { $ne: req.user._id }, isRead: false },
      { isRead: true }
    );

    res.status(200).json({ success: true, data: messages.reverse() });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب الرسائل' });
  }
};

// @desc   إرسال رسالة
// @route  POST /api/messages/conversations/:conversationId
// @access Private
exports.sendMessage = async (req, res) => {
  try {
    const { content } = req.body;
    const { conversationId } = req.params;

    if (!content) return res.status(400).json({ success: false, message: 'محتوى الرسالة مطلوب' });

    // التأكد أن المستخدم طرف في المحادثة
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: req.user._id
    });
    if (!conversation) return res.status(403).json({ success: false, message: 'غير مصرح لك بالإرسال في هذه المحادثة' });

    const message = await Message.create({
      conversation: conversationId,
      sender: req.user._id,
      content
    });

    // تحديث آخر رسالة في المحادثة
    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: message._id,
      lastMessageAt: new Date()
    });

    const populated = await message.populate('sender', 'profile.firstName profile.lastName profile.avatar');

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء إرسال الرسالة' });
  }
};

// @desc   جلب عدد الرسائل غير المقروءة
// @route  GET /api/messages/unread
// @access Private
exports.getUnreadCount = async (req, res) => {
  try {
    const count = await Message.countDocuments({
      sender: { $ne: req.user._id },
      isRead: false,
      conversation: { $in: await Conversation.distinct('_id', { participants: req.user._id }) }
    });
    res.status(200).json({ success: true, unreadCount: count });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ' });
  }
};
