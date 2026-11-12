import type { Config } from 'jest';

const config: Config = {
  rootDir: '.',
  testEnvironment: 'node',
  // Same reason as the web suite: do not starve the other suites running in parallel.
  maxWorkers: '50%',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }] },
  setupFiles: ['<rootDir>/src/testing/jest-setup.ts'],
  moduleNameMapper: {
    '^@routinely/shared$': '<rootDir>/../../packages/shared/src/index.ts',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/main.ts',
    '!src/testing/**',
    '!src/**/index.ts',
    '!src/**/fixtures.ts',
  ],
  coverageThreshold: {
    global: {},
    './src/routines/engine/': { statements: 95, branches: 90, functions: 95, lines: 95 },
  },
};

export default config;
