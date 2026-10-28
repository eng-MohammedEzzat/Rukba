'use strict';

const { v2: cloudinary } = require('cloudinary');
const env = require('../../config/env');
const ApiError = require('./ApiError');

let configured = false;

function ensureConfigured() {
  if (configured) return;

  if (!env.cloudinaryCloudName || !env.cloudinaryApiKey || !env.cloudinaryApiSecret) {
    throw new ApiError(
      500,
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.'
    );
  }

  cloudinary.config({
    cloud_name: env.cloudinaryCloudName,
    api_key: env.cloudinaryApiKey,
    api_secret: env.cloudinaryApiSecret,
    secure: true,
  });
  configured = true;
}

/**
 * Upload an image buffer to Cloudinary.
 * @returns {{ url: string, publicId: string }}
 */
function uploadImage(buffer, { folder, type = 'upload', transformation } = {}) {
  ensureConfigured();

  return new Promise((resolve, reject) => {
    const options = {
      folder,
      resource_type: 'image',
      type,
      overwrite: true,
    };
    if (transformation) {
      options.transformation = transformation;
    }

    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) {
        reject(new ApiError(502, 'Failed to upload image to Cloudinary', err.message));
        return;
      }
      resolve({
        url: result.secure_url,
        publicId: result.public_id,
      });
    });
    stream.end(buffer);
  });
}

async function deleteImage(publicId, { type = 'upload' } = {}) {
  if (!publicId) return null;
  ensureConfigured();
  return cloudinary.uploader.destroy(publicId, {
    resource_type: 'image',
    type,
  });
}

function uploadUserImage(buffer, { userId, folder = 'rukba/users' } = {}) {
  return uploadImage(buffer, {
    folder: userId ? `${folder}/${userId}` : folder,
    type: 'upload',
    transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'auto' }],
  });
}

async function deleteUserImage(publicId) {
  return deleteImage(publicId, { type: 'upload' });
}

function uploadTicketQr(buffer, { ticketId }) {
  if (!ticketId) {
    throw new ApiError(500, 'ticketId is required for QR upload');
  }
  return uploadImage(buffer, {
    folder: `rukba/tickets/qr/${ticketId}`,
    type: 'authenticated',
  });
}

/**
 * Short-lived signed download URL for an authenticated ticket QR.
 */
function ticketQrDownloadUrl(publicId, { ttlSeconds = 300 } = {}) {
  ensureConfigured();
  if (!publicId) {
    throw new ApiError(404, 'QR image not available');
  }
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  return cloudinary.utils.private_download_url(publicId, 'png', {
    type: 'authenticated',
    expires_at: expiresAt,
  });
}

module.exports = {
  deleteImage,
  uploadUserImage,
  deleteUserImage,
  uploadTicketQr,
  ticketQrDownloadUrl,
};
