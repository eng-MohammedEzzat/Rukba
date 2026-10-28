'use strict';

const { User } = require('../../models');
const ApiError = require('../../utils/shared/ApiError');
const { normalizeUsername } = require('../../utils/auth/username');
const { uploadUserImage, deleteUserImage } = require('../../utils/shared/cloudinary');

async function cleanupImageBestEffort(publicId) {
  try {
    await deleteUserImage(publicId);
  } catch {
    // Image cleanup is best-effort.
  }
}

async function updateProfile(user, fields, imageFile) {
  const { fullName, username } = fields;
  const hasText = fullName !== undefined || username !== undefined;
  const hasImage = Boolean(imageFile);

  if (!hasText && !hasImage) {
    throw new ApiError(400, 'Provide fullName, username, and/or image');
  }

  const updates = {};

  if (username !== undefined) {
    const usernameNormalized = normalizeUsername(username);
    const currentNormalized = normalizeUsername(user.username);
    if (usernameNormalized !== currentNormalized) {
      const taken = await User.findOne({
        usernameNormalized,
        _id: { $ne: user._id },
      }).select('_id');
      if (taken) {
        throw new ApiError(409, 'Username already taken');
      }
    }
    updates.username = username;
    updates.usernameNormalized = usernameNormalized;
  }

  if (fullName !== undefined) {
    updates.fullName = fullName;
  }

  const previousPublicId = user.image?.publicId || null;
  let uploadedPublicId = null;

  if (hasImage) {
    const uploaded = await uploadUserImage(imageFile.buffer, {
      userId: String(user._id),
    });
    uploadedPublicId = uploaded.publicId;
    updates.image = {
      url: uploaded.url,
      publicId: uploaded.publicId,
    };
  }

  let saved;
  try {
    saved = await User.findOneAndUpdate(
      { _id: user._id },
      { $set: updates },
      { returnDocument: 'after', runValidators: true }
    );
  } catch (err) {
    if (uploadedPublicId) {
      await cleanupImageBestEffort(uploadedPublicId);
    }
    throw err;
  }

  if (!saved) {
    if (uploadedPublicId) {
      await cleanupImageBestEffort(uploadedPublicId);
    }
    throw new ApiError(401, 'User not found or inactive');
  }

  if (hasImage && previousPublicId && previousPublicId !== uploadedPublicId) {
    await cleanupImageBestEffort(previousPublicId);
  }

  return toPublicUser(saved);
}

function toPublicUser(user) {
  return {
    id: user._id,
    phone: user.phone,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    status: user.status,
    image: user.image,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function toUserSummary(user) {
  return {
    id: String(user._id),
    phone: user.phone,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    status: user.status,
  };
}

module.exports = {
  updateProfile,
  toPublicUser,
  toUserSummary,
};
