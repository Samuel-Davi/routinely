import type { Config } from 'jest';

const config: Config = {
  rootDir: '..',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }] },
  moduleNameMapper: {
    '^@routinely/shared$': '<rootDir>/../../packages/shared/src/index.ts',
  },
  globalSetup: '<rootDir>/test/global-setup.ts',
  testTimeout: 30_000,
};

export default config;
