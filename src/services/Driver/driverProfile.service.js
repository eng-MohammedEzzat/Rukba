'use strict';

const { User, DriverProfile } = require('../../models');
const { VERIFICATION_STATUSES } = require('../../constants/enums');
const ApiError = require('../../utils/shared/ApiError');
const roleApiError = require('../../utils/auth/roleApiError');
const { normalizeUsername } = require('../../utils/auth/username');
const { uploadUserImage } = require('../../utils/shared/cloudinary');
const { toUserSummary, cleanupImageBestEffort } = require('../shared/user.service');

async function getDriverProfile(user) {
  const profile = await DriverProfile.findOne({ user: user._id });
  return toPublicDriver(user, profile);
}

async function assertUsernameAvailable(user, usernameNormalized) {
  if (usernameNormalized === normalizeUsername(user.username)) return;
  const taken = await User.exists({ usernameNormalized, _id: { $ne: user._id } });
  if (taken) {
    throw roleApiError(409, 'اسم المستخدم مستخدم مسبقًا', 'IDENTITY_CONFLICT');
  }
}

async function updateDriverProfile(user, { fullName, username }, imageFile) {
  if (fullName === undefined && username === undefined && !imageFile) {
    throw new ApiError(400, 'يرجى إدخال الاسم الكامل أو اسم المستخدم أو الصورة');
  }

  const updates = {};
  if (fullName !== undefined) updates.fullName = fullName;
  if (username !== undefined) {
    const usernameNormalized = normalizeUsername(username);
    await assertUsernameAvailable(user, usernameNormalized);
    updates.username = username;
    updates.usernameNormalized = usernameNormalized;
  }

  const previousPublicId = user.image?.publicId || null;
  let uploadedPublicId = null;
  if (imageFile) {
    const uploaded = await uploadUserImage(imageFile.buffer, { userId: String(user._id) });
    uploadedPublicId = uploaded.publicId;
    updates.image = { url: uploaded.url, publicId: uploaded.publicId };
  }

  let saved;
  try {
    saved = await User.findOneAndUpdate(
      { _id: user._id, role: 'driver', status: 'active', isDeleted: { $ne: true } },
      { $set: updates },
      { returnDocument: 'after', runValidators: true }
    );
  } catch (err) {
    if (uploadedPublicId) await cleanupImageBestEffort(uploadedPublicId);
    throw err;
  }

  if (!saved) {
    if (uploadedPublicId) await cleanupImageBestEffort(uploadedPublicId);
    throw roleApiError(401, 'حساب السائق الحالي غير متاح.', 'INVALID_CREDENTIALS');
  }

  if (uploadedPublicId && previousPublicId && previousPublicId !== uploadedPublicId) {
    await cleanupImageBestEffort(previousPublicId);
  }

  return getDriverProfile(saved);
}

function publicDecision(decision) {
  if (!decision) return null;
  return {
    outcome: decision.outcome,
    reviewedAt: decision.reviewedAt,
    rejectionReason: decision.rejectionReason ?? null,
  };
}

function toPublicDriver(user, profile) {
  const verificationStatus = profile?.verificationStatus;
  const profileComplete = Boolean(
    profile?.licenseNumber?.trim() &&
      profile?.vehicleDescription?.trim() &&
      VERIFICATION_STATUSES.includes(verificationStatus)
  );

  return {
    user: { ...toUserSummary(user), image: user.image },
    profile: profile
      ? {
          id: String(profile._id),
          licenseNumber: profile.licenseNumber,
          vehicleDescription: profile.vehicleDescription,
          verificationStatus,
          verifiedAt: profile.verifiedAt ?? null,
          submittedAt: profile.submittedAt ?? null,
          applicationSource: profile.applicationSource || 'legacy',
          decision: publicDecision(profile.decision),
        }
      : null,
    profileComplete,
    canOperate: Boolean(
      user.role === 'driver' &&
        user.status === 'active' &&
        !user.isDeleted &&
        profileComplete &&
        verificationStatus === 'verified'
    ),
  };
}

module.exports = { getDriverProfile, updateDriverProfile, toPublicDriver };
