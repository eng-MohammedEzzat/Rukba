'use strict';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function parsePagination({ page, limit } = {}, { maxLimit = MAX_LIMIT } = {}) {
  const pageNum = page === undefined ? DEFAULT_PAGE : Number(page);
  const limitNum = limit === undefined ? DEFAULT_LIMIT : Number(limit);

  const safePage =
    Number.isInteger(pageNum) && pageNum >= 1 ? pageNum : DEFAULT_PAGE;
  const safeLimit =
    Number.isInteger(limitNum) && limitNum >= 1
      ? Math.min(limitNum, maxLimit)
      : DEFAULT_LIMIT;

  return {
    page: safePage,
    limit: safeLimit,
    skip: (safePage - 1) * safeLimit,
  };
}

function paginationMeta({ page, limit, total }) {
  return {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

module.exports = {
  parsePagination,
  paginationMeta,
};
