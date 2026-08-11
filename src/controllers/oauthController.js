const User = require('../models/User');
const { formatUserResponse } = require('../utils/userResponse');
const {
  generateToken,
  createStoredRefreshToken,
} = require('./authController');

const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const LINKEDIN_USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';

async function verifyGoogleIdToken(idToken) {
  const url = new URL(GOOGLE_TOKENINFO_URL);
  url.searchParams.set('id_token', idToken);
  const res = await fetch(url.toString(), { method: 'POST' });
  if (!res.ok) {
    throw new Error(`Google token verification failed with HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!data.email || data.email_verified !== 'true') {
    throw new Error('Google email is not verified');
  }
  return data;
}

async function verifyLinkedInAccessToken(accessToken) {
  const res = await fetch(LINKEDIN_USERINFO_URL, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`LinkedIn token verification failed with HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!data.email || !data.email_verified) {
    throw new Error('LinkedIn email is not verified');
  }
  return data;
}

// @desc    تسجيل دخول/إنشاء حساب عبر Google
// @route   POST /api/oauth/google
// @access  Public
exports.google = async (req, res) => {
  try {
    const { idToken, email, firstName, lastName, avatar } = req.body;
    if (!idToken) {
      return res.status(400).json({ success: false, message: 'idToken مطلوب' });
    }

    let googleUser;
    try {
      googleUser = await verifyGoogleIdToken(idToken);
    } catch (error) {
      return res.status(401).json({ success: false, message: 'تعذر التحقق من حساب Google: ' + error.message });
    }

    if (email && googleUser.email.toLowerCase() !== email.toLowerCase()) {
      return res.status(401).json({ success: false, message: 'البريد الإلكتروني غير مطابق لتوثيق Google' });
    }

    let user = await User.findOne({ email: googleUser.email });
    if (user) {
      const updates = {};
      if (firstName && !user.profile?.firstName) updates['profile.firstName'] = firstName;
      if (lastName && !user.profile?.lastName) updates['profile.lastName'] = lastName;
      if (avatar && !user.profile?.avatar) updates['profile.avatar'] = avatar;
      if (Object.keys(updates).length > 0) {
        user = await User.findByIdAndUpdate(user._id, { $set: updates }, { new: true });
      }
    } else {
      user = await User.create({
        email: googleUser.email,
        password: require('crypto').randomBytes(24).toString('hex'),
        role: 'JobSeeker',
        profile: {
          firstName: firstName || googleUser.given_name || '',
          lastName: lastName || googleUser.family_name || '',
          avatar: avatar || googleUser.picture || '',
        },
      });
    }

    const token = generateToken(user._id);
    const refreshToken = await createStoredRefreshToken(user._id, req);

    res.status(200).json({
      success: true,
      token,
      refreshToken,
      user: formatUserResponse(user),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    تسجيل دخول/إنشاء حساب عبر LinkedIn
// @route   POST /api/oauth/linkedin
// @access  Public
exports.linkedin = async (req, res) => {
  try {
    const { accessToken, email, firstName, lastName, avatar, headline } = req.body;
    if (!accessToken) {
      return res.status(400).json({ success: false, message: 'accessToken مطلوب' });
    }

    let linkedinUser;
    try {
      linkedinUser = await verifyLinkedInAccessToken(accessToken);
    } catch (error) {
      return res.status(401).json({ success: false, message: 'تعذر التحقق من حساب LinkedIn: ' + error.message });
    }

    if (email && linkedinUser.email.toLowerCase() !== email.toLowerCase()) {
      return res.status(401).json({ success: false, message: 'البريد الإلكتروني غير مطابق لتوثيق LinkedIn' });
    }

    let user = await User.findOne({ email: linkedinUser.email });
    if (user) {
      const updates = {};
      if (firstName && !user.profile?.firstName) updates['profile.firstName'] = firstName;
      if (lastName && !user.profile?.lastName) updates['profile.lastName'] = lastName;
      if (avatar && !user.profile?.avatar) updates['profile.avatar'] = avatar;
      if (headline && !user.profile?.headline) updates['profile.headline'] = headline;
      if (Object.keys(updates).length > 0) {
        user = await User.findByIdAndUpdate(user._id, { $set: updates }, { new: true });
      }
    } else {
      user = await User.create({
        email: linkedinUser.email,
        password: require('crypto').randomBytes(24).toString('hex'),
        role: 'JobSeeker',
        profile: {
          firstName: firstName || linkedinUser.given_name || '',
          lastName: lastName || linkedinUser.family_name || '',
          avatar: avatar || linkedinUser.picture || '',
          headline: headline || '',
        },
      });
    }

    const token = generateToken(user._id);
    const refreshToken = await createStoredRefreshToken(user._id, req);

    res.status(200).json({
      success: true,
      token,
      refreshToken,
      user: formatUserResponse(user),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};