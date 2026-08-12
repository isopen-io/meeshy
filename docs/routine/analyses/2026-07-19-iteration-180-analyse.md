# Iteration 180 — `getUserLanguageChoices` émet des codes NON normalisés (`'pt-br'`) → cible de traduction divergente + `selectedInputLanguage` bloqué invalide

## Protocole (démarrage)
`main` @ `6e27a59` (derniers merges : #2042 android/feed comment mentions, #2037
ios/a11y UploadProgressBar…). Branche `claude/brave-archimedes-3powqv`
réinitialisée sur `origin/main`. Ce cycle prend **180**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared). Point de départ : **backlog Finding 3 (itér. 178)**
consigné par l'itération 179, jugé actionnable après vérification de l'impact
client.

## Current state
`apps/web/utils/user-language-preferences.ts` → `getUserLanguageChoices(user)`
produit la liste `LanguageChoice[]` consommée par le composer web
(`bubble-stream-page.tsx`, `ConversationLayout.tsx`). Le champ `code` de chaque
choix était émis en **lowercase brut** de la préférence, sans normalisation
BCP-47 :

```ts
const systemCode  = user.systemLanguage?.toLowerCase() || 'fr';   // 'pt-BR' → 'pt-br'
const regionalCode = user.regionalLanguage?.toLowerCase();        // 'en-US' → 'en-us'
const customCode   = user.customDestinationLanguage?.toLowerCase();
```

Or ce `code` sert de **cible de traduction** et alimente `selectedInputLanguage`
(langue de composition). Partout ailleurs dans le Prisme Linguistique, les codes
sont normalisés via `normalizeLanguageCode` :
- `resolveUserPreferredLanguage` / `getUserLanguagePreferences` (mêmes prefs) →
  `'pt'`
- `MessageTranslation.targetLanguage`, mapping NLLB, clés de cache → `'pt'`

## Problems identified
1. **Cible de traduction divergente (SSOT non respectée).** Pour une préférence
   sous-taguée (`'pt-BR'`, `'en-US'`, `'fr_FR'` — cas réels du sync iOS
   `Locale.current.identifier` / legacy), `getUserLanguageChoices` émettait
   `'pt-br'` alors que `getUserLanguagePreferences` sur le **même utilisateur**
   émet `'pt'`. Deux codes différents pour la même intention → traduction
   demandée/résolue de façon incohérente, cache raté.
2. **`selectedInputLanguage` bloqué sur une valeur invalide.** Dans
   `bubble-stream-page.tsx`, l'état s'initialise et se « répare » à
   `user.systemLanguage || 'fr'` (brut, **non lowercasé**), tandis que la
   validation teste l'appartenance à `languageChoices.map(c => c.code)`
   (lowercase). Pour `systemLanguage = 'en-US'`, `['en-us'].includes('en-US')` est
   `false` → l'effet réécrit `'en-US'` (no-op React) → sélection **coincée hors
   plage** indéfiniment. Bug latent aggravé par toute normalisation du `code`.
3. **Description/drapeau perdus pour les variantes régionales.** `findLanguageMeta`
   cherchait le catalogue sur le code brut (`'pt-br'`) → aucune entrée → repli
   `🌍` / `'Français'` alors que `'pt'` existe.

## Root cause
`getUserLanguageChoices` (extrait historiquement de `bubble-stream-page`)
réimplémentait la « résolution de préférence » à la main (`?.toLowerCase()`) au
lieu de déléguer à la SSOT `normalizeLanguageCode` — exactement le pattern que les
itérations précédentes ont uniformisé pour `resolveUserLanguage` /
`getUserLanguagePreferences`. La normalisation manquait donc au **dernier site**
qui émet des codes de langue côté web.

## Business / Technical impact
- **UX / traduction** : un utilisateur dont la préférence porte un sous-tag région
  (fréquent quand la valeur vient de la locale appareil ou d'un ancien client)
  compose et demande des traductions vers un code (`'pt-br'`) qui ne matche aucune
  `MessageTranslation` (`'pt'`) → messages non traduits / re-traduits inutilement.
- **UX composer** : sélecteur de langue d'entrée figé sur une valeur hors-liste,
  impossible à « réparer » par l'effet de validation.
- **Cohérence** : le dernier émetteur de codes langue web passe enfin par la même
  SSOT que le reste du Prisme.

## Risk assessment
Très faible. Type de retour inchangé (`LanguageChoice[]`). `normalizeLanguageCode`
est idempotent et déjà en production partout ailleurs ; pour un code déjà canonique
(`'fr'`, `'en'`) le résultat est identique. Le repli `🇫🇷 « Français »` reste
attaché à `systemLanguage` **absent/inconnu** (lookup meta sur le code normalisé,
pas sur le repli `'fr'` d'émission) — préservé par test. Les 41 tests existants
restent verts.

## Proposed improvements / Correctif (TDD)
- **RED** : +5 tests (`user-language-preferences.test.ts`) — code canonique pour
  `systemLanguage` sous-tagué (`'en-US'` → `'en'`, `'fr_FR'` → `'fr'`),
  normalisation regional/custom, dédup des variantes ne différant que par le
  sous-tag région. Le mock `@meeshy/shared/utils/languages` expose désormais
  `getSupportedLanguageCodes` (requis par `normalizeLanguageCode`).
- **GREEN** :
  1. `user-language-preferences.ts` — `systemCode`/`regionalCode`/`customCode`
     passent par `normalizeLanguageCode(...)` ; le lookup meta utilise le code
     normalisé (le repli Français reste lié à l'absence, pas au repli `'fr'`).
  2. `bubble-stream-page.tsx` — `selectedInputLanguage` s'initialise à
     `normalizeLanguageCode(user.systemLanguage) || 'fr'` et la validation répare à
     `languageChoices[0]?.code ?? 'fr'` (le choix système, `isDefault`), garantissant
     l'appartenance à la plage. Dépendance `user.systemLanguage` désormais inutile
     retirée du tableau de l'effet.

## Expected benefits
- Parité stricte code émis ↔ `getUserLanguagePreferences` ↔
  `MessageTranslation.targetLanguage` pour toutes les préférences sous-taguées.
- `selectedInputLanguage` toujours dans la plage des choix offerts.
- Nom/drapeau corrects pour les variantes régionales.

## Implementation complexity
Faible — délégation à un helper existant + alignement de 2 sites d'un même
composant.

## Validation criteria
- `apps/web` : `user-language-preferences.test.ts` **46/46** verts (5 nouveaux) ;
  `ConversationLayout.test.tsx` **18/18** verts.
- `tsc --noEmit` : **0 nouvelle erreur** sur les lignes touchées (baseline
  pré-existante inchangée).

## Backlog (candidats consignés pour une itération future)
- `MeeshySocketIOManager.ts:752` — ordre de résolution différent
  (`username ?? displayName ?? …`, sémantique « présence key ») : hors périmètre,
  à ne PAS uniformiser sans analyse dédiée.
- F69 (`sanitizeFileName` overlong sans extension) : latent, 0 appelant.
