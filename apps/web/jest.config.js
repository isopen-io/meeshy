const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// Add any custom config to be passed to Jest
const customJestConfig = {
  // Add more setup options before each test is run
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',

  // Reduce verbosity
  verbose: false,
  silent: true,

  // Use summary reporter for cleaner output
  reporters: [
    ['default', {
      summaryThreshold: 0,  // Always show summary
      verbose: false
    }]
  ],
  moduleNameMapper: {
    // Handle module aliases (this will be automatically configured for you soon)
    '^@/(.*)$': '<rootDir>/$1',
    '^@meeshy/shared/(.*)$': '<rootDir>/../../packages/shared/dist/$1',
    // Mock lucide-react to avoid ESM issues - catch both direct and modularized imports
    '^lucide-react$': '<rootDir>/__mocks__/lucide-react.js',
    '^lucide-react/dist/esm/icons/(.*)$': '<rootDir>/__mocks__/lucide-react.js',
    // Mock styled-jsx to avoid module resolution issues
    'styled-jsx/style': '<rootDir>/__mocks__/styled-jsx.js',
    // Mock next/font/google for font tests
    '^next/font/google$': '<rootDir>/__mocks__/next/font/google.js',
    // Mock tone to avoid ESM issues
    '^tone$': '<rootDir>/__mocks__/tone.js',
  },
  // Transform ESM packages - handle both standard and pnpm nested node_modules
  transformIgnorePatterns: [
    'node_modules/(?!(\\.pnpm|lucide-react|@radix-ui|sonner|cmdk|@tanstack|recharts|d3-.*|internmap|delaunator|robust-predicates|tone)/)',
  ],
  collectCoverageFrom: [
    'app/**/*.{js,jsx,ts,tsx}',
    'components/**/*.{js,jsx,ts,tsx}',
    'hooks/**/*.{js,jsx,ts,tsx}',
    'services/**/*.{js,jsx,ts,tsx}',
    'stores/**/*.{js,jsx,ts,tsx}',
    'utils/**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/.next/**',
    '!**/coverage/**',
    '!**/dist/**',
  ],
  testMatch: [
    '**/__tests__/**/*.test.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
    '/__tests__/integration/',
    '\\.md$',
    '/_archived/',
  ],
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)
