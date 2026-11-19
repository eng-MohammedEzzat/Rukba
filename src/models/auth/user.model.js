'use strict';

const mongoose = require('mongoose');
const { ROLES, USER_STATUSES } = require('../../constants/enums');

const DEFAULT_AVATAR =
  (process.env.CLOUDINARY_DEFAULT_IMAGE_URL &&
    process.env.CLOUDINARY_DEFAULT_IMAGE_URL.trim()) ||
  'https://res.cloudinary.com/docqumxby/image/upload/v1789558087/Rukba_user.png';

const deviceTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, trim: true },
    platform: { type: String, enum: ['ios', 'android', 'web', 'unknown'], default: 'unknown' },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const passwordResetSchema = new mongoose.Schema(
  {
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0, min: 0 },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: false }
);

const imageSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      trim: true,
      default: DEFAULT_AVATAR,
    },
    publicId: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    // Self-registration sets this to false until the phone OTP is confirmed; other accounts default to verified.
    phoneVerified: {
      type: Boolean,
      default: true,
    },
    username: {
      type: String,
      required: true,
      trim: true,
    },
    usernameNormalized: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    fullName: {
      type: String,
      trim: true,
      default: '',
    },
    image: {
      type: imageSchema,
      default: () => ({
        url: DEFAULT_AVATAR,
        publicId: null,
      }),
    },
    role: {
      type: String,
      enum: ROLES,
      required: true,
      default: 'passenger',
    },
    status: {
      type: String,
      enum: USER_STATUSES,
      default: 'active',
    },
    deviceTokens: {
      type: [deviceTokenSchema],
      default: [],
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    authRevision: {
      type: Number,
      min: 0,
      default: 0,
      validate: Number.isInteger,
      select: false,
    },
    passwordReset: {
      type: passwordResetSchema,
      default: null,
      select: false,
    },
  },
  { timestamps: true }
);

userSchema.pre('validate', function setUsernameNormalized() {
  if (this.username) {
    this.usernameNormalized = String(this.username).trim().toLowerCase();
  }
});

module.exports = mongoose.model('User', userSchema);
