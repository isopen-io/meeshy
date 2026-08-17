/**
 * Configuration ESLint « flat » — sans `FlatCompat`.
 *
 * Pourquoi ce fichier a changé : depuis `eslint-config-next@16`, les presets
 * `core-web-vitals` et `typescript` sont EUX-MÊMES des configs plates
 * (`Linter.Config[]`, cf. `dist/index.d.ts`). Les passer à
 * `FlatCompat.extends()` — le pont eslintrc → flat — faisait valider un objet
 * plat par le validateur eslintrc, qui `JSON.stringify` la config pour formater
 * ses erreurs et butait sur le cycle `plugins.react → configs → plugins` :
 *
 *     TypeError: Converting circular structure to JSON
 *       --> starting at object with constructor 'Object'
 *       |     property 'configs' -> object with constructor 'Object'
 *       ...
 *       --- property 'react' closes the circle
 *
 * ESLint tombait donc AVANT de lire une seule ligne de code, sur tout le dépôt.
 * Les presets sont maintenant importés et étalés directement : plus de pont,
 * plus de validateur eslintrc dans le chemin.
 *
 * `.eslintrc.local.json` a été supprimé au passage : ESLint 9+ ignore
 * totalement le format eslintrc, donc son interdiction des imports « barrel »
 * ne s'appliquait plus à rien. La règle est reprise ci-dessous, où elle
 * s'exécute réellement.
 */
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      'coverage/**',
      'node_modules/**',
      'public/**',
      'next-env.d.ts',
      '__mocks__/**',
      'lib/image-loader.js',
    ],
  },

  ...nextCoreWebVitals,
  ...nextTypescript,

  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],

      // Reprise de l'ancien `.eslintrc.local.json`, que ESLint 9+ n'ouvrait
      // plus : un import de barrel tire tout le module-graph du dossier et
      // ruine le tree-shaking.
      //
      // `paths` et NON `patterns` : `patterns` applique une sémantique
      // gitignore, où `@/components/ui` couvre aussi `@/components/ui/**` —
      // la règle interdisait donc exactement l'import direct qu'elle
      // recommande. `paths` ne matche que le spécificateur EXACT, c'est-à-dire
      // le fichier barrel lui-même.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/components',
              message:
                "Import barrel interdit — importez directement : import { Button } from '@/components/ui/button'",
            },
            {
              name: '@/components/ui',
              message:
                "Import barrel interdit — importez directement : import { Button } from '@/components/ui/button'",
            },
            {
              name: '@/components/common',
              message:
                "Import barrel interdit — importez directement : import { ErrorBoundary } from '@/components/common/ErrorBoundary'",
            },
            {
              name: '@/lib/ui-imports',
              message:
                "Fichier DEPRECATED — importez directement : import { Button } from '@/components/ui/button'",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
