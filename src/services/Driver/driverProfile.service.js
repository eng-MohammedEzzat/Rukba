'use strict';

const { User, DriverProfile } = require('../../models');
const { VERIFICATION_STATUSES } = require('../../constants/enums');
const roleApiError = require('../../utils/auth/roleApiError');
const { toUserSummary } = require('../shared/user.service');

async function getDriverProfile(user) {
  const profile = await DriverProfile.findOne({ user: user._id });
  return toPublicDriver(user, profile);
}

async function updateDriverFullName(userId, fullName) {
  const user = await User.findOneAndUpdate(
    { _id: userId, role: 'driver', status: 'active', isDeleted: { $ne: true } },
    { $set: { fullName } },
    { returnDocument: 'after', runValidators: true }
  );
  if (!user) {
    throw roleApiError(401, 'Current Driver account is unavailable.', 'INVALID_CREDENTIALS');
  }
  return getDriverProfile(user);
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
    user: toUserSummary(user),
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

module.exports = { getDriverProfile, updateDriverFullName, toPublicDriver };
