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
    // Specific @/ mocks MUST come before the generic @/ alias (first match wins in Jest)
    // Mock MermaidDiagramImpl to avoid loading mermaid in tests
    '^@/components/markdown/MermaidDiagramImpl$': '<rootDir>/__mocks__/components/markdown/MermaidDiagramImpl.tsx',
    // Mock MarkdownMessage to avoid react-markdown ESM issues
    '^@/components/messages/MarkdownMessage$': '<rootDir>/__mocks__/components/messages/MarkdownMessage.tsx',
    // Handle module aliases
    '^@/(.*)$': '<rootDir>/$1',
    // D-13 tranchée (2026-08-18, tasks/lentille-cloture-phase1.md §3) — il n'y
    // a PAS de règle `@meeshy/shared/*` ici : les suites web testent la
    // SOURCE de @meeshy/shared, jamais dist/. `next/jest` régénère son
    // propre mapper depuis les `paths` de tsconfig.json (qui pointent vers
    // packages/shared/*.ts, pas dist/) et cette génération l'emporte sur
    // tout mapper `dist/` posé ici — re-preuve : une ligne `dist/$1` a été
    // ajoutée ICI, un fichier dist a été empoisonné (retour truqué), et le
    // calcul lu par la suite est resté celui de la SOURCE malgré la ligne
    // (`require.resolve` rend pourtant un chemin `dist/` — piège aggravant,
    // c'est un résolveur différent du chemin réellement chargé). Ligne
    // supprimée : assumé, pas réparé — la parité dist⇔source reste gardée
    // par `__tests__/lentille/shared-law-dist-parity.test.ts` (46 vecteurs,
    // import par chemin relatif explicite des deux côtés, discrimination
    // prouvée dans les deux sens).
    // Strip .js from relative imports: shared source uses ESM .js extensions but jest needs .ts
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // Mock lucide-react to avoid ESM issues - catch both direct and modularized imports
    '^lucide-react$': '<rootDir>/__mocks__/lucide-react.js',
    '^lucide-react/dist/esm/icons/(.*)$': '<rootDir>/__mocks__/lucide-react.js',
    // Mock styled-jsx to avoid module resolution issues
    'styled-jsx/style': '<rootDir>/__mocks__/styled-jsx.js',
    // Mock next/font/google for font tests
    '^next/font/google$': '<rootDir>/__mocks__/next/font/google.js',
    // Mock tone to avoid ESM issues
    '^tone$': '<rootDir>/__mocks__/tone.js',
    // Mock dompurify for tests
    '^dompurify$': '<rootDir>/__mocks__/dompurify.js',
    // Mock pitchy to avoid ESM issues
    '^pitchy$': '<rootDir>/__mocks__/pitchy.js',
    // Mock @ffmpeg/ffmpeg to avoid ESM issues
    '^@ffmpeg/ffmpeg$': '<rootDir>/__mocks__/@ffmpeg/ffmpeg.js',
    // Mock mermaid to avoid ESM issues
    '^mermaid$': '<rootDir>/__mocks__/mermaid.js',
    // Mock react-markdown and its plugins to avoid ESM issues
    '^react-markdown$': '<rootDir>/__mocks__/react-markdown.js',
    '^remark-gfm$': '<rootDir>/__mocks__/react-markdown.js',
    '^rehype-raw$': '<rootDir>/__mocks__/react-markdown.js',
    '^rehype-sanitize$': '<rootDir>/__mocks__/react-markdown.js',
    // Mock react-syntax-highlighter to avoid ESM issues
    '^react-syntax-highlighter$': '<rootDir>/__mocks__/react-syntax-highlighter.js',
    '^react-syntax-highlighter/dist/esm/(.*)$': '<rootDir>/__mocks__/react-syntax-highlighter.js',
  },
  // Transform ESM packages - handle both standard and pnpm nested node_modules
  transformIgnorePatterns: [
    'node_modules/(?!(\\.pnpm|lucide-react|@radix-ui|sonner|cmdk|@tanstack|recharts|d3-.*|internmap|delaunator|robust-predicates|tone|pitchy|fft\\.js|mermaid|react-markdown|remark-.*|rehype-.*|micromark.*|mdast-.*|unist-.*|vfile.*|bail|trough|unified|is-plain-obj|property-information|hast-.*|space-separated-tokens|comma-separated-tokens|ccount|escape-string-regexp|markdown-table|trim-lines|zwitch|longest-streak|decode-named-character-reference|character-entities)/)',
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
    '/e2e/',
  ],

  // Ratcheting floor — raised 2026-06-17 after P1 Real-time × web slice.
  // Previous thresholds (2026-06-16): lines:37 / branches:29 / stmts:36 / funcs:33.
  // New measured: 38.81% lines / 30.99% branches / 38.02% stmts / 35.13% funcs.
  // Thresholds set 1% below local measure to absorb CI environment delta.
  // Only ever raise these values, never lower them.
  coverageThreshold: {
    global: {
      lines: 42,
      branches: 34,
      statements: 41,
      functions: 38,
    },
  },
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)
