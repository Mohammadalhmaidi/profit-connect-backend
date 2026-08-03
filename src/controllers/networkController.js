const Connection = require('../models/Connection');
const User = require('../models/User');

const isValidId = (id) => /^[0-9a-fA-F]{24}$/.test(id);

// مساعدة: إرسال إشعار لمستخدم محدد
async function pushNotification(userId, type, message, senderId) {
  await User.findByIdAndUpdate(userId, {
    $push: {
      notifications: { type, message, senderId, read: false }
    }
  });
}

// ============================================================
// طلبات الاتصال
// ============================================================

// @desc    إرسال طلب اتصال
// @route   POST /api/network/connect/:userId
// @access  Private
exports.sendConnectionRequest = async (req, res) => {
  try {
    const recipientId = req.params.userId;
    const requesterId = req.user.id;

    if (recipientId === requesterId) {
      return res.status(400).json({ success: false, message: 'لا يمكنك إرسال طلب اتصال لنفسك' });
    }

    if (!isValidId(recipientId)) {
      return res.status(400).json({ success: false, message: 'معرّف المستخدم غير صالح' });
    }

    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    }

    // منع تكرار الطلب في أي اتجاه
    const existing = await Connection.findOne({
      $or: [
        { requester: requesterId, recipient: recipientId },
        { requester: recipientId, recipient: requesterId }
      ]
    });

    if (existing) {
      if (existing.status === 'accepted') {
        return res.status(400).json({ success: false, message: 'أنتما متصلان بالفعل' });
      }
      return res.status(400).json({ success: false, message: 'هناك طلب اتصال موجود بالفعل بينكما' });
    }

    const connection = await Connection.create({
      requester: requesterId,
      recipient: recipientId,
      status: 'pending'
    });

    await pushNotification(recipientId, 'connection_request', 'لديك طلب اتصال جديد', requesterId);

    res.status(201).json({ success: true, message: 'تم إرسال طلب الاتصال بنجاح', data: connection });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء إرسال طلب الاتصال' });
  }
};

// @desc    قبول طلب اتصال
// @route   PUT /api/network/accept/:requestId
// @access  Private
exports.acceptConnectionRequest = async (req, res) => {
  try {
    const connection = await Connection.findById(req.params.requestId);

    if (!connection) {
      return res.status(404).json({ success: false, message: 'طلب الاتصال غير موجود' });
    }

    if (connection.recipient.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'غير مصرح لك بقبول هذا الطلب' });
    }

    if (connection.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'هذا الطلب لم يعد معلقاً' });
    }

    connection.status = 'accepted';
    await connection.save();

    await pushNotification(connection.requester, 'connection_accepted', 'تم قبول طلب الاتصال الخاص بك', req.user.id);

    res.status(200).json({ success: true, message: 'تم قبول طلب الاتصال، أنتما الآن متصلان!' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء قبول الطلب' });
  }
};

// @desc    رفض طلب اتصال
// @route   PUT /api/network/reject/:requestId
// @access  Private
exports.rejectConnectionRequest = async (req, res) => {
  try {
    const connection = await Connection.findById(req.params.requestId);

    if (!connection) {
      return res.status(404).json({ success: false, message: 'طلب الاتصال غير موجود' });
    }

    if (connection.recipient.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'غير مصرح لك برفض هذا الطلب' });
    }

    if (connection.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'هذا الطلب لم يعد معلقاً' });
    }

    connection.status = 'rejected';
    await connection.save();

    res.status(200).json({ success: true, message: 'تم رفض طلب الاتصال' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء رفض الطلب' });
  }
};

// @desc    إلغاء طلب اتصال مُرسل (قبل الرد عليه)
// @route   DELETE /api/network/cancel/:userId
// @access  Private
exports.cancelConnectionRequest = async (req, res) => {
  try {
    const result = await Connection.findOneAndDelete({
      requester: req.user.id,
      recipient: req.params.userId,
      status: 'pending'
    });

    if (!result) {
      return res.status(404).json({ success: false, message: 'لا يوجد طلب مرسل معلق لإلغائه' });
    }

    res.status(200).json({ success: true, message: 'تم إلغاء طلب الاتصال' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء إلغاء الطلب' });
  }
};

// @desc    جلب الطلبات الواردة المعلقة
// @route   GET /api/network/requests
// @access  Private
exports.getIncomingRequests = async (req, res) => {
  try {
    const requests = await Connection.find({ recipient: req.user.id, status: 'pending' })
      .populate('requester', 'profile.firstName profile.lastName profile.avatar profile.headline')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: requests.length, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب الطلبات' });
  }
};

// @desc    جلب جهات الاتصال الحالية (المقبولة) — يرجع بيانات الطرف الآخر فقط
// @route   GET /api/network/connections
// @access  Private
exports.getMyConnections = async (req, res) => {
  try {
    const connections = await Connection.find({
      status: 'accepted',
      $or: [{ requester: req.user.id }, { recipient: req.user.id }]
    })
      .populate('requester', 'profile.firstName profile.lastName profile.avatar profile.headline')
      .populate('recipient', 'profile.firstName profile.lastName profile.avatar profile.headline');

    const others = connections.map((c) =>
      c.requester._id.toString() === req.user.id ? c.recipient : c.requester
    );

    res.status(200).json({ success: true, count: others.length, data: others });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب جهات الاتصال' });
  }
};

// @desc    إزالة اتصال حالي
// @route   DELETE /api/network/remove/:userId
// @access  Private
exports.removeConnection = async (req, res) => {
  try {
    const result = await Connection.findOneAndDelete({
      status: 'accepted',
      $or: [
        { requester: req.user.id, recipient: req.params.userId },
        { requester: req.params.userId, recipient: req.user.id }
      ]
    });

    if (!result) {
      return res.status(404).json({ success: false, message: 'لا توجد جهة اتصال حالية لحذفها' });
    }

    res.status(200).json({ success: true, message: 'تم إزالة جهة الاتصال بنجاح' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء إزالة جهة الاتصال' });
  }
};

// @desc    حالة العلاقة بيني وبين مستخدم آخر
// @route   GET /api/network/status/:userId
// @access  Private
exports.getConnectionStatus = async (req, res) => {
  try {
    const targetId = req.params.userId;

    if (!isValidId(targetId)) {
      return res.status(400).json({ success: false, message: 'معرّف المستخدم غير صالح' });
    }

    const target = await User.findById(targetId);
    if (!target) {
      return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    }

    const connection = await Connection.findOne({
      $or: [
        { requester: req.user.id, recipient: targetId },
        { requester: targetId, recipient: req.user.id }
      ]
    });

    let status = 'none';
    let connectionId = null;

    if (connection) {
      if (connection.status === 'accepted') {
        status = 'connected';
      } else if (connection.requester.toString() === req.user.id) {
        status = 'pending_sent';
      } else {
        status = 'pending_received';
      }
      connectionId = connection._id;
    }

    res.status(200).json({ success: true, data: { status, connectionId, targetId } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب حالة الاتصال' });
  }
};

// ============================================================
// المتابعون / المتابَعون
// ============================================================

// @desc    جلب قائمة متابعيني
// @route   GET /api/network/followers
// @access  Private
exports.getMyFollowers = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('profile.followers profile.followersCount')
      .populate('profile.followers', 'profile.firstName profile.lastName profile.avatar profile.headline');

    res.status(200).json({ success: true, count: user.profile.followersCount, data: user.profile.followers });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب المتابعين' });
  }
};

// @desc    جلب قائمة المتابَعين من قِبلّي
// @route   GET /api/network/following
// @access  Private
exports.getMyFollowing = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('profile.following profile.followingCount')
      .populate('profile.following', 'profile.firstName profile.lastName profile.avatar profile.headline');

    res.status(200).json({ success: true, count: user.profile.followingCount, data: user.profile.following });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب المتابَعين' });
  }
};

// ============================================================
// البحث عن المستخدمين
// ============================================================

// @desc    البحث عن مستخدمين
// @route   GET /api/network/search?q=&limit=
// @access  Private
exports.searchUsers = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) {
      return res.status(400).json({ success: false, message: 'يرجى إدخال نص للبحث' });
    }

    const filter = {
      $or: [
        { 'profile.firstName': { $regex: q, $options: 'i' } },
        { 'profile.lastName': { $regex: q, $options: 'i' } },
        { 'profile.headline': { $regex: q, $options: 'i' } },
        { username: { $regex: q, $options: 'i' } }
      ]
    };

    const users = await User.find(filter)
      .select('profile.firstName profile.lastName profile.avatar profile.headline username role status')
      .sort({ createdAt: -1 })
      .limit(parseInt(req.query.limit) || 20);

    // علامات الحالة: هل أتابعه؟ هل نرتبط باتصال؟
    const ids = users.map((u) => u._id);
    const [connections, me] = await Promise.all([
      Connection.find({ $or: [{ requester: req.user.id }, { recipient: req.user.id }] }),
      User.findById(req.user.id).select('profile.following')
    ]);

    const myFollowing = new Set((me && me.profile.following || []).map((id) => id.toString()));
    const connMap = {};
    connections.forEach((c) => {
      const other = c.requester.toString() === req.user.id ? c.recipient : c.requester;
      connMap[other.toString()] = c.status;
    });

    const data = users.map((u) => ({
      _id: u._id,
      username: u.username,
      role: u.role,
      profile: u.profile,
      isFollowing: myFollowing.has(u._id.toString()),
      connectionStatus: connMap[u._id.toString()] || 'none'
    }));

    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء البحث' });
  }
};
