'use strict';

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { User, DriverProfile } = require('../../models');
const ApiError = require('../../utils/shared/ApiError');
const roleApiError = require('../../utils/auth/roleApiError');
const { cleanupImageBestEffort } = require('../shared/user.service');
const { uploadUserImage } = require('../../utils/shared/cloudinary');
const { toPublicDriver } = require('../Driver/driverProfile.service');
const { normalizePhone } = require('../../utils/auth/phone');
const { normalizeUsername } = require('../../utils/auth/username');
const { runInTransaction } = require('../../utils/shared/runInTransaction');

const registrationError= (err)=> {
  if (err.code === 11000) {
    return roleApiError(409, 'Phone or username already registered', 'IDENTITY_CONFLICT');
  }
  if (
    err.code === 20 ||
    err.code === 303 ||
    /transaction numbers are only allowed|replica set member|mongos/i.test(err.message || '')
  ) {
    return roleApiError(503, 'Registration is temporarily unavailable.', 'TEMPORARILY_UNAVAILABLE');
  }
  return err;
}

const registerDriver=async  (input, imageFile)=> {
  if (!imageFile) {
    throw new ApiError(400, 'Validation failed', [
      { path: 'image', message: 'image is required' },
    ]);
  }

  const phone = normalizePhone(input.phone);
  const usernameNormalized = normalizeUsername(input.username);
  const passwordHash = await bcrypt.hash(input.password, 10);
  const submittedAt = new Date();
  const userId = new mongoose.Types.ObjectId();
  const uploaded = await uploadUserImage(imageFile.buffer, { userId: String(userId) });
  let user;
  let profile;

  try {
    await runInTransaction(async (session) => {
      [user] = await User.create(
        [
          {
            _id: userId,
            phone,
            username: input.username,
            usernameNormalized,
            passwordHash,
            fullName: input.fullName,
            image: { url: uploaded.url, publicId: uploaded.publicId },
            role: 'driver',
            status: 'active',
            isDeleted: false,
            authRevision: 0,
          },
        ],
        { session }
      );
      [profile] = await DriverProfile.create(
        [
          {
            user: user._id,
            licenseNumber: input.licenseNumber,
            identificationNumber: input.identificationNumber,
            vehicleDescription: input.vehicleDescription,
            verificationStatus: 'pending',
            verifiedAt: null,
            applicationSource: 'signup',
            submittedAt,
            submission: {
              phone,
              username: user.username,
              fullName: user.fullName,
              licenseNumber: input.licenseNumber,
              vehicleDescription: input.vehicleDescription,
            },
            decision: null,
          },
        ],
        { session }
      );
    });
  } catch (err) {
    await cleanupImageBestEffort(uploaded.publicId);
    throw registrationError(err);
  }

  return toPublicDriver(user, profile);
}

module.exports = { registerDriver };
