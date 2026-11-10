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

function errorData(err, statusCode) {
  const errors = err.isOperational ? fieldErrors(err.details) : null;
  if (errors) return { errors };
  if (statusCode === 429 && typeof err.details?.retryAfterSeconds === 'number') {
    return { retryAfterSeconds: err.details.retryAfterSeconds };
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

  const data = errorData(err, statusCode);
  if (data?.retryAfterSeconds != null) {
    res.set('Retry-After', String(data.retryAfterSeconds));
  }

  return apiResponse(res, { statusCode, message, data });
}

module.exports = { notFoundHandler, errorHandler };
