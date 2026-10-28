'use strict';

const multer = require('multer');
const ApiError = require('../../utils/shared/ApiError');

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new ApiError(400, 'Only JPEG, PNG, WebP, or GIF images are allowed'));
      return;
    }
    cb(null, true);
  },
});

/** Multipart field name must be `image`. */
module.exports = upload.single('image');
