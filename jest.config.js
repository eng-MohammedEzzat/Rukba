/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/unit'],
  testMatch: ['**/*.test.js'],
  setupFiles: ['<rootDir>/tests/helpers/loadTestEnv.js'],
  clearMocks: true,
};
