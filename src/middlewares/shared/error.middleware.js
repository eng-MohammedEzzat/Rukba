'use strict';

const ApiError = require('../../utils/shared/ApiError');
const apiResponse = require('../../utils/shared/apiResponse');

function notFoundHandler(_req, _res, next) {
  next(new ApiError(404, 'الرابط المطلوب غير موجود'));
}

function duplicateMessage(err) {
  if (err.code !== 11000) return null;
  const rawField = Object.keys(err.keyPattern || {})[0];
  const field = rawField === 'usernameNormalized' ? 'username' : rawField;
  if (field === 'phone' || field === 'username') {
    return 'رقم الهاتف أو اسم المستخدم مسجّل مسبقًا';
  }
  return field ? `قيمة الحقل ${field} موجودة مسبقًا` : 'هذا السجل موجود مسبقًا';
}

function uploadMessage(err) {
  if (err.name !== 'MulterError') return null;
  return err.code === 'LIMIT_FILE_SIZE'
    ? 'يجب ألا يتجاوز حجم الصورة 2 ميغابايت'
    : 'الملف المرفوع غير صالح';
}

function fieldErrors(details) {
  if (!Array.isArray(details)) return null;
  return details.map((issue) => ({
    field: String(issue.path || ''),
    message: String(issue.message || 'قيمة غير صالحة'),
  }));
}

const STATUS_CODES = Object.freeze({
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'TOO_MANY_ATTEMPTS',
  500: 'INTERNAL_ERROR',
  503: 'TEMPORARILY_UNAVAILABLE',
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Operational error details are written for clients (`code`, `field`, `display`, ...). */
function errorData(err) {
  if (!err.isOperational) return null;
  const errors = fieldErrors(err.details);
  if (errors) return { code: 'VALIDATION_FAILED', errors };
  if (isPlainObject(err.details) && Object.keys(err.details).length) {
    return { ...err.details };
  }
  return null;
}

function errorHandler(err, _req, res, _next) {
  let statusCode = err.statusCode || 500;
  let message =
    statusCode === 500 && !err.isOperational
      ? 'حدث خطأ داخلي في الخادم'
      : err.message || 'حدث خطأ داخلي في الخادم';

  const duplicate = duplicateMessage(err);
  if (duplicate) {
    statusCode = 409;
    message = duplicate;
  }

  const upload = uploadMessage(err);
  if (upload) {
    statusCode = 400;
    message = upload;
  }

  let data = errorData(err) || {};
  if (duplicate) data = { code: 'DUPLICATE' };
  if (upload) data = { code: 'INVALID_UPLOAD' };
  data = { ...data, code: data.code || STATUS_CODES[statusCode] || 'ERROR' };
  if (statusCode === 429 && data.retryAfterSeconds != null) {
    res.set('Retry-After', String(data.retryAfterSeconds));
  }

  return apiResponse(res, { statusCode, message, data });
}

module.exports = { notFoundHandler, errorHandler };
