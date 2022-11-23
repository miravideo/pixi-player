module.exports = {
  clearMocks: true,
  collectCoverage: true,
  collectCoverageFrom: [
    '<rootDir>/src/**/*.js',
  ],
  moduleNameMapper: {
    '@/(.*)$': '<rootDir>/src/$1',
  },
  coverageDirectory: '<rootDir>/coverage',
  coveragePathIgnorePatterns: [
    '/node_modules/',
    'src/shaders/*',
    'src/app/*',
    'src/player.js',
  ],
  coverageReporters: [
    // "json",
    'text-summary',
    // "text",
    'lcov',
    // "clover"
  ],
  modulePaths: ['<rootDir>'],
  // preset: 'babel-jest',
  reporters: ['default'],
  rootDir: './',
  testEnvironment: 'node',
  testRegex: [
    'test/.*\\.test\\.js',
  ],
  transform: {
    "^.+\\.(css|less|frag|vert|glsl)$": "./test/staticmock.js",
    "^.+\\.js?$": "babel-jest",
  },
  verbose: true,
};
