# Iteration 179 — `getUserLanguageChoices` émet des codes NON normalisés, divergeant de la source unique du Prisme

## Protocole (démarrage)
`main` @ `155251a` (dernier merge : PR #2026 — android/feed collages adaptatifs).
Branche `claude/brave-archimedes-as7za7` réinitialisée sur `origin/main`. Ce cycle
prend **179**. Backlog hérité de l'itération 178 (Finding 3, consigné).

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/gateway/shared). Dépendances installées via `bun install` ;
`packages/shared` reconstruit (`prisma generate` + `bun run build`) pour peupler
`dist/` (résolution `@meeshy/shared/*` → `dist` dans le jest web).

## Current state
`apps/web/utils/user-language-preferences.ts` expose deux familles de résolution
de langue consommées côté web :

- **Source unique (normalisée)** — `resolveUserPreferredLanguage()` délègue à
  `resolveUserLanguage()` (`@meeshy/shared`), et `getUserLanguagePreferences()` à
  `resolveUserLanguagesOrdered()`. Toutes deux passent chaque préférence par
  `normalizeLanguageCode()` : `'pt-BR'` → `'pt'`, `'zh-Hant-HK'` → `'zh'`,
  `'es_ES'` → `'es'`. C'est la forme canonique employée partout (clés de
  traduction, mapping NLLB, `MessageTranslation.targetLanguage`).

- **`getUserLanguageChoices()`** — construisait ses codes émis en appliquant
  seulement `?.toLowerCase()` (PAS `normalizeLanguageCode`). Un
  `customDestinationLanguage = 'pt-BR'` produisait donc un choix `code: 'pt-br'`.

Ces choix alimentent :
1. **`bubble-stream-page.tsx`** — `choice.code` devient `selectedInputLanguage`,
   passé en 2e argument de `sendMessageToService(...)` = **`originalLanguage`** du
   message composé. Le validateur (`useEffect` @362) comparait `selectedInputLanguage`
   à `languageChoices.map(c => c.code)` et, en cas d'absence, retombait sur
   `user.systemLanguage` **brut**.
2. **`ConversationLayout.tsx`** — `selectedLanguage` est fixé via
   `resolveUserPreferredLanguage(user)` (**normalisé**, ex. `'pt'`) tandis que le
   sélecteur reçoit `languageChoices` (codes **non normalisés**, ex. `'pt-br'`).

## Problems identified
1. **Divergence SSOT.** Pour toute préférence stockée sous forme BCP-47 régionale
   ou à casse mixte (`'pt-BR'`, `'zh-Hant'`, `'EN-us'`), `getUserLanguageChoices`
   émettait un code (`'pt-br'`) que ni `resolveUserPreferredLanguage` ni le
   pipeline de traduction n'emploient (`'pt'`).
2. **Message tagué avec une langue non canonique.** Un utilisateur dont la langue
   d'entrée sélectionnée est `'pt-br'` envoie des messages avec
   `originalLanguage: 'pt-br'` — jamais produit ailleurs, cassant la déduplication
   des cibles de traduction et la résolution du Prisme côté réception.
3. **Sélecteur désynchronisé (ConversationLayout).** `selectedLanguage = 'pt'`
   (normalisé) n'appartenant pas à `languageChoices` (`['pt-br', …]`), la langue
   courante n'était jamais surlignée dans le sélecteur.
4. **Reset brut (bubble-stream).** Le fallback de validation ciblait
   `user.systemLanguage` brut — lui-même absent des `languageChoices` dès qu'il
   porte une casse mixte ou un tag région : `selectedInputLanguage` restait bloqué
   sur une valeur non sélectionnable (bug latent **préexistant**, indépendant de
   la normalisation).

## Root cause
`getUserLanguageChoices` a été écrit avant la centralisation de
`normalizeLanguageCode` dans `@meeshy/shared` et n'a jamais été rebranché dessus,
contrairement à ses fonctions sœurs du même module. Le `?.toLowerCase()` encode
« normaliser = mettre en minuscule » là où la règle canonique est « réduire au
code de langue supporté (2/3 lettres), en préservant les codes ISO 639-3 ».

## Business / Technical impact
- **Prisme / traduction** : messages composés avec un `originalLanguage` non
  canonique → traductions potentiellement non demandées vers les bonnes cibles,
  contenu affiché dans la mauvaise langue préférée.
- **UX** : langue courante non surlignée dans le sélecteur (ConversationLayout) ;
  langue d'entrée figée sur une valeur invalide (bubble-stream) pour les comptes à
  préférence régionale.
- **Dette** : dernière des trois fonctions du module non alignée sur la source
  unique, désormais convergente.

## Risk assessment
Faible. Le type de retour (`LanguageChoice[]`) est inchangé. `normalizeLanguageCode`
préserve les codes 2/3-lettres déjà canoniques (`'fr'` → `'fr'`, `'bas'` → `'bas'`)
et un code 2-lettres inconnu (`'xx'` → `'xx'`) — tous les cas des tests existants
restent identiques. Le seul changement de comportement (réduction des tags
région/script/casse) est strictement une convergence vers la forme déjà employée
partout ailleurs. Le reset bubble-stream vise désormais `languageChoices[0].code`
(1er choix = langue système), **garanti présent** dans la liste.

## Correctif (TDD)
- **RED** : +6 tests (`__tests__/utils/user-language-preferences.test.ts`) —
  normalisation system/regional/custom (`'pt-BR'`→`'pt'`, `'zh-Hant-HK'`→`'zh'`,
  `'es_ES'`→`'es'`), collapse system/regional ne différant que par le tag région,
  et résolution du nom catalogue pour un system régional (« Portuguese » vs
  fallback 🇫🇷) + préservation du fallback « Français » quand `systemLanguage` est
  absent. Échouaient sur le code d'origine (`Received: 'pt-br' / 'es_es'`, longueur 2).
- **GREEN** :
  1. `getUserLanguageChoices` — `systemCode/regionalCode/customCode` calculés via
     `normalizeLanguageCode(...)` (au lieu de `?.toLowerCase()`). Dedup sur la forme
     normalisée. Meta système résolue via raw **puis** code normalisé (préserve le
     fallback 🇫🇷 quand la préférence est absente). `normalizeLanguageCode` était
     à importer depuis `@meeshy/shared/utils/language-normalize` — réutilisation
     stricte de la source unique, zéro logique dupliquée.
  2. `bubble-stream-page.tsx` — état initial `selectedInputLanguage` =
     `resolveUserPreferredLanguage()` (normalisé, hook) ; reset de validation vise
     `languageChoices[0]?.code ?? 'fr'` (code garanti sélectionnable) au lieu de
     `user.systemLanguage` brut.
  `ConversationLayout.tsx` — **aucune modification** : il utilise déjà
  `resolveUserPreferredLanguage` ; la normalisation des choix suffit à réaligner
  son sélecteur.

## Validation criteria
- Suite `user-language-preferences` : **47/47** verts (dont 6 nouveaux).
- Suites consommatrices : `ConversationLayout` + util → **65/65** verts.
- Répertoire `__tests__/utils/` complet : **994/994** verts, aucune régression.
- `tsc --noEmit` web : `user-language-preferences.ts` **0 erreur** ;
  `bubble-stream-page.tsx` **13 erreurs** identiques à la base (artefacts
  d'environnement `_LanguageChoice`/`_searchQuery`, aucune à mes lignes) →
  **aucune nouvelle erreur**.
- ESLint : config non chargeable dans cet environnement bun-hoisted (crash
  « circular structure », artefact tooling) — code idiomatique, aligné sur le style
  environnant.

## Backlog (candidats consignés pour une itération future)
- **Finding 2 (itér. 178)** : `routes/conversations/messages.ts:2320/2636` —
  `displayName: sender.displayName ?? sender.user?.displayName ?? null` laisse
  fuir `''` alors que l'`avatar` de la même ligne est déjà durci via
  `resolveParticipantAvatar`. Envisager un resolver blank-aware partagé (miroir de
  `resolveParticipantAvatar` dans `packages/shared/utils/participant-helpers.ts`),
  APRÈS vérification que le client ne re-résout pas déjà via `getUserDisplayName`.
- F69 (`sanitizeFileName` overlong sans extension) : toujours latent, 0 appelant.
