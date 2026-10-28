'use strict';

const ApiError = require('../../utils/shared/ApiError');
const apiResponse = require('../../utils/shared/apiResponse');

function notFoundHandler(_req, _res, next) {
  next(new ApiError(404, 'Route not found'));
}

function duplicateMessage(err) {
  if (err.code !== 11000) return null;
  const rawField = Object.keys(err.keyPattern || {})[0];
  const field = rawField === 'usernameNormalized' ? 'username' : rawField;
  if (field === 'phone' || field === 'username') {
    return 'Phone or username already registered';
  }
  return field ? `${field} already exists` : 'This record already exists';
}

function uploadMessage(err) {
  if (err.name !== 'MulterError') return null;
  return err.code === 'LIMIT_FILE_SIZE'
    ? 'Image must be 2MB or smaller'
    : 'Invalid upload';
}

function fieldErrors(details) {
  if (!Array.isArray(details)) return null;
  return details.map((issue) => ({
    field: String(issue.path || ''),
    message: String(issue.message || 'Invalid value'),
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
      ? 'Internal server error'
      : err.message || 'Internal server error';

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
