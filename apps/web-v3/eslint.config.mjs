import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const SPRITE_ONLY = "La v3 n'utilise que le sprite Phosphor de packages/icons.";
const ONE_THEME_ENGINE = 'Le thème de la v3 a un seul moteur : app/theme-script.tsx.';

const forbiddenModules = [
  { root: 'lucide-react', message: SPRITE_ONLY },
  { root: '@phosphor-icons/web', message: SPRITE_ONLY },
  { root: 'next-themes', message: ONE_THEME_ENGINE },
];

const restrictedImportPatterns = forbiddenModules.map(({ root, message }) => ({
  group: [root, `${root}/**`],
  message,
}));

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'next-env.d.ts'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-imports': ['error', { patterns: restrictedImportPatterns }],
    },
  },
];

export default config;
