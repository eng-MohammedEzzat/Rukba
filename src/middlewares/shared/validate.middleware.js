'use strict';

const ApiError = require('../../utils/shared/ApiError');

function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      return next(new ApiError(400, 'Validation failed', details));
    }
    // Express 5 makes req.query a getter; assign to validatedQuery instead.
    if (source === 'query') {
      req.validatedQuery = parsed.data;
    } else {
      req[source] = parsed.data;
    }
    return next();
  };
}

module.exports = validate;
