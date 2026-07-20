# Iteration 184 — `getLanguageDisplayName` / `getLanguageFlag` / `isSupportedLanguage` (web) : lookup sensible à la casse → divergence avec la SSOT `languages.ts`, drapeau globe + code brut affichés pour une préférence `'EN'`

## Protocole (démarrage)
`main` @ `62f338f` (derniers merges : #2165 ios/a11y plural labels, #2132 —
itération **183**, shared/validators cross-field-validation docstring). Branche
`claude/brave-archimedes-xx8xvp` réinitialisée sur `origin/main` (PR #2132 déjà
squash-mergée). Ce cycle prend **184**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). Harnais validés ce cycle : `packages/shared`
vitest (1365 tests), `services/gateway` jest (prisma client régénéré + `dist`
shared rebuild), `apps/web` jest. Sélection : revue Priorité 1 « Single Source of
Truth » (CLAUDE.md) appliquée aux helpers d'affichage de langue web — copie locale
divergée de la SSOT.

## Current state
`apps/web/utils/language-utils.ts` expose trois helpers d'affichage consommés par
plusieurs composants (`ActiveUsersSection.tsx`, `use-conversation-stats.ts`,
`user-selector.tsx`, `language-settings.tsx`) :

```ts
export function getLanguageDisplayName(languageCode: string | null | undefined): string {
  if (!languageCode) return 'Français';
  return LANGUAGE_NAMES[languageCode] || languageCode.toUpperCase();   // ligne 142
}
export function getLanguageFlag(languageCode: string | null | undefined): string {
  if (!languageCode) return '🇫🇷';
  return LANGUAGE_FLAGS[languageCode] || '🌐';                          // ligne 150
}
export function isSupportedLanguage(languageCode: string): boolean {
  return languageCode in LANGUAGE_NAMES;                               // ligne 169
}
```

`LANGUAGE_NAMES` / `LANGUAGE_FLAGS` sont **exclusivement en clés lowercase**
(`'fr'`, `'en'`…). Les trois helpers font un lookup **brut, sans normalisation**.

La SSOT correspondante — `packages/shared/utils/languages.ts` `getLanguageInfo`
(ligne 1164) — normalise systématiquement : `const normalizedCode =
code.toLowerCase().trim();`. `getLanguageFlag`/`getLanguageName`/
`isSupportedLanguage` shared délèguent tous à cette normalisation
(`languages.ts:1198`, `:1223`). La copie web a silencieusement dérivé.

## Problems identified
1. **Divergence SSOT (règle « Single Source of Truth » violée).** Pour un code
   non-lowercase, la copie web et la SSOT shared retournent des résultats
   différents pour le même utilisateur :
   - `getLanguageDisplayName('EN')` → **`'EN'`** (web) vs `'English'` (SSOT)
   - `getLanguageFlag('EN')` → **`'🌐'`** globe (web) vs `'🇺🇸'` (SSOT)
   - `isSupportedLanguage('EN')` → **`false`** (web) vs `true` (SSOT)
2. **Cas réel, pas théorique.** Les préférences in-app sont persistées **verbatim**
   (aucune normalisation à l'écriture) — c'est précisément pourquoi
   `packages/shared/utils/conversation-helpers.ts:36` documente explicitement le
   traitement d'un `systemLanguage: 'EN'` stocké. Les consommateurs web passent
   `user.systemLanguage` / `message.originalLanguage` **directement** à ces helpers
   (`ActiveUsersSection.tsx:52`, `use-conversation-stats.ts:41`). Un `'EN'` stocké
   rend donc le placeholder globe + le code brut au lieu du drapeau et du nom.
3. **Régression de test invisible.** `apps/web/__tests__/utils/language-utils.test.ts`
   ne teste QUE des codes lowercase connus + un code totalement inconnu (`'xyz'`
   → `'XYZ'`). Aucun cas casse-mixte connu → le défaut passe entre les mailles.

## Root causes
Copie locale d'un helper partagé, écrite avant/sans alignement sur la
normalisation `.toLowerCase().trim()` de la SSOT. Le charset des maps étant
lowercase-only, l'absence de normalisation d'entrée casse tout code non déjà
lowercase.

## Business impact
Affichage dégradé (drapeau générique 🌐, code technique « EN » au lieu du nom
localisé) dans les panneaux participants / stats de conversation / sélecteurs —
directement visible par l'utilisateur, en contradiction avec le Prisme
Linguistique (« le contenu traduit s'affiche comme du contenu natif »).

## Technical impact
Incohérence entre deux implémentations du même helper ; toute évolution future de
la SSOT (nouvelle langue, normalisation région) ne se propage pas à la copie web.

## Risk assessment
Très faible. Changement mécanique de normalisation d'entrée. Le fallback
inconnu (`'xyz'` → `'XYZ'`, `'🌐'`) est préservé. Aucun code lowercase existant
n'est affecté (`'en'.toLowerCase().trim()` === `'en'`).

## Proposed improvements / Correctif (TDD)
- **RED** : +tests (`language-utils.test.ts`) démontrant `getLanguageDisplayName('EN')
  === 'English'`, `getLanguageFlag('EN') === getLanguageFlag('en')`,
  `isSupportedLanguage('EN') === true`, et parité trim (`' en '`). Échouent sur la
  copie brute.
- **GREEN** : normaliser une fois en tête de chaque helper —
  `const code = languageCode.toLowerCase().trim();` — puis lookup sur `code`,
  fallback `code.toUpperCase()` (parité stricte avec `getLanguageInfo` shared).

## Expected benefits
- Parité stricte web ↔ SSOT shared pour l'affichage de langue.
- Drapeau + nom localisés corrects quelle que soit la casse stockée.
- Une classe entière de divergences de casse éliminée par construction.

## Implementation complexity
Faible — 3 helpers, normalisation d'entrée d'une ligne chacun + tests.

## Validation criteria
- `apps/web` : suite `language-utils.test.ts` verte, incluant les nouveaux cas
  casse-mixte (40 → 40+N tests).
- Aucune régression sur les assertions lowercase/`'xyz'`/null/undefined
  existantes.

## Backlog (candidats consignés pour une itération future)
- `apps/web/utils/link-identifier.ts:97` — `normalizeForDisplay` strippe `mshy_`
  sur une forme `linkId` qui ne le contient jamais (no-op mort, faible impact).
- `apps/web/utils/truncate.ts:60` — `text.slice(0, maxLength)` peut couper une
  paire de substituts emoji (le sibling `initials.ts` se protège via `[...spread]`).
- `apps/web/lib/deep-link.ts` — mapping `STATUS` app-scheme (`meeshy://p/`) vs
  web-fallback (`/mood/`) potentiellement incohérent (à confirmer vs schéma iOS).
- Reliquat itér. 182/183 : `validatePagination` limit=0, `normalizeLanguageCode`
  collision ISO 639-3 — décisions produit requises avant correction.
