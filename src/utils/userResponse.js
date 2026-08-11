const computeAge = (birthDate) => {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--;
  return age >= 0 ? age : null;
};

const formatUserResponse = (user, options = {}) => {
  const userObject = typeof user?.toObject === 'function' ? user.toObject() : user || {};
  const includePosts = options.includePosts === true;

  const profile = userObject.profile
    ? { ...userObject.profile, age: computeAge(userObject.profile.birthDate) }
    : userObject.profile;

  const response = {
    id: userObject._id || userObject.id,
    email: userObject.email,
    username: userObject.username,
    role: userObject.role,
    profile,
    professional: userObject.professional,
    employerProfile: userObject.employerProfile,
    companyEmployeeProfile: userObject.companyEmployeeProfile,
    settings: userObject.settings,

    ...(includePosts && userObject.posts ? { posts: userObject.posts } : {}),
  };

  // إرفاق بيانات الشركة إن وُجدت (لصاحب العمل/صاحب المشروع الحر/موظفة الشركة)
  if (userObject.company) {
    response.company = userObject.company;
  }

  return response;
};

module.exports = {
  formatUserResponse,
};
