module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  collectCoverageFrom: [
    'src/controllers/**/*.ts',
    'src/services/ehr.service.ts'
  ],
  setupFiles: ['<rootDir>/tests/setup.ts']
};
