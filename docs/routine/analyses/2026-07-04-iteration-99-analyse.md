# Iteration 99 — Analyse d'optimisation (2026-07-04)

## Protocole (démarrage)
`main` @ `b3c9675` (« feat(android/contacts): three-state presence dot … » — HEAD au démarrage
après `git checkout -B claude/brave-archimedes-2vlhoc origin/main`, working tree propre). 0 commit
non-mergé à préserver.

PR ouvertes au démarrage : **#1476** (iOS — `CallTypeBadgeView`), **#1475** (gateway —
`AttachmentReactionService` duplicate-reaction race + `schema.prisma`), **#1473** (iOS — story text
tool). **Toutes disjointes** des fichiers ciblés ici (aucune ne touche
`packages/shared/utils/{conversation-helpers,validation}.ts`,
`services/gateway/src/services/{message-translation,preferences}/`, `routes/anonymous.ts`,
`apps/web/utils/user-language-preferences.ts`).

## Thème : normalisation de casse des codes de langue — finir le durcissement F62 à **toutes** les frontières

L'itération 98 (F62, mergée `560ef19`) a corrigé `resolveUserLanguage` / `resolveParticipantLanguage`
pour **lowercaser à la lecture** les préférences in-app, alignant `meta.userLanguage` sur les clés de
traduction minuscules. Ce cycle **audite l'ensemble des frontières restantes** et solde le drift de
casse là où il subsiste encore — dont **une occurrence LIVE dans le pipeline de traduction**.

Deux revues parallèles (gateway/shared + résolution de langue) ont convergé : le drift de casse F62
n'était pas clos, il restait ouvert sur 4 surfaces distinctes, toutes vérifiables en bun/vitest, toutes
disjointes des PR ouvertes.

---

### Current state (4 frontières restantes)

**(A) LIVE — `MessageTranslationService._extractConversationLanguages`**
`services/gateway/src/services/message-translation/MessageTranslationService.ts` (~l.790). La branche
**registered** passe par `resolveUserLanguagesOrdered(...)` (lowercase + dédup). La branche
**anonyme/bot** ajoute `participant.language` **verbatim** :
```ts
if (participant.language) languages.add(participant.language); // brut, non-lowercasé
```

**(B) ROOT CAUSE — écriture verbatim des codes de langue**
- `AuthService` (register) et `profile.ts` → écrivent `systemLanguage`/`regionalLanguage`/
  `customDestinationLanguage` **verbatim**. `.refine(isSupportedLanguage)` **valide sans
  transformer** (`isSupportedLanguage` lowercase pour le lookup mais renvoie la valeur brute).
- `PreferencesService.updateLanguagePreferences` (l.369-373) → persiste le DTO **verbatim**.
- `anonymous.ts` : schema `language: z.string().default('fr')` (pas de lowercase) ; écrit
  `language: body.language` **verbatim** (l.394) → **source des données anonymes en casse mixte que
  (A) réinjecte dans le pipeline**. La restriction `allowedLanguages.includes(body.language)`
  (l.261) est aussi **sensible à la casse**.

**(C) WEB — helpers d'énumération sensibles à la casse**
`apps/web/utils/user-language-preferences.ts` :
- `getUserLanguageChoices` (l.15-49) : `SUPPORTED_LANGUAGES.find(l => l.code === user.systemLanguage)`
  — comparaison **sensible à la casse** contre un catalogue lowercase. `'EN'` **manque** le lookup →
  retombe silencieusement sur le label/flag 🇫🇷 « Français ».
- `getUserLanguagePreferences` (l.77-98) : dédup `!==` sensible à la casse → `['EN','en']`.

**(D) SSOT / dead-code — `conversation-helpers.ts`**
- `resolveParticipantLanguage` (l.187-198) **ré-implémente** l'échelle du Prisme au lieu de déléguer,
  bien que sa JSDoc affirme « en déléguant à `resolveUserLanguage` ». A déjà driftée : F62 a dû
  patcher le `.toLowerCase()` ici **et** dans `resolveUserLanguage` en lockstep (SSOT violée — cf.
  règle explicite `CLAUDE.md` : « NEVER reimplement the priority order locally »).
- `resolveUserTranslationLanguages` (l.104-112) : **zéro appelant prod** (grep repo-wide), driftée
  (ne lowercase pas, ignore custom/device, fallback `['fr']`) — piège latent (réintroduit le bug
  F62 si recâblée).
- `getRequiredLanguages` (l.307) : garde `if (lang)` **inatteignable** (`resolveUserLanguage`
  retourne toujours une string non-vide, fallback `'fr'`).

### Problems identified
- **Violation LIVE du Prisme (règle #1)** : un anonyme rejoignant un share link avec `{language:'EN'}`
  injecte `'EN'` dans les cibles de traduction. La `MessageTranslation` est stockée sous clé
  minuscule (F62) → le client ne matche jamais `'EN'` et **retombe sur l'original** au lieu de la
  traduction. + **cible dupliquée** (`'en'`+`'EN'`) = requête NLLB gaspillée (CPU translator +
  bande passante) sur le chemin le plus chaud du produit.
- **Root cause non corrigée** : la lecture (F62) ne fait que **compenser** une base en casse mixte.
  Tant que l'écriture n'est pas normalisée, chaque nouvelle frontière de lecture doit re-patcher le
  même `.toLowerCase()` (dette récurrente, déjà 2 patchs lockstep en F62).
- **Bug UI web** : label/drapeau erroné (« Français » 🇫🇷) pour tout code stocké en majuscules.
- **SSOT** : 2 fonctions du même module ré-implémentent l'échelle → drift prouvé.

### Root cause
`isSupportedLanguage` (`languages.ts:1220`) fait `code.toLowerCase().trim()` **uniquement pour le
lookup** — accepte `'EN'` mais ne le transforme pas. Aucun point d'écriture ne normalise. La casse
n'est donc pas garantie minuscule en base ; les résolveurs de lecture compensent un par un.

### Business impact
Sur un produit dont le Prisme Linguistique est le principe fondateur : contenu **non traduit** pour
un utilisateur dont un pair anonyme a une préférence en majuscules, plus gaspillage translator — panne
invisible et non diagnosticable côté utilisateur, sur le cœur de l'expérience.

### Technical impact
Normaliser **à l'écriture** (root cause) rend la base auto-cohérente : les compensations de lecture
deviennent défense-en-profondeur, et toute future frontière de lecture est correcte par construction.
La normalisation défensive sur la branche anonyme de `_extractConversationLanguages` répare en plus
les données **déjà** stockées en casse mixte, sans migration.

### Risk assessment
Très faible. `.toLowerCase()` sur un code déjà minuscule = no-op. Les transforms Zod
`string → string` ne changent aucun type inféré (`z.infer` inchangé). Aucun test consommateur
n'assertait une préservation de casse (grep vide). `resolveParticipantLanguage` /
`resolveUserTranslationLanguages` : 0 appelant prod. La restriction `allowedLanguages` devient
**insensible à la casse** — élargissement volontaire et correct (un lien restreint à `'en'` doit
matcher un `'EN'`).

### Proposed improvements
1. **(A)** `_extractConversationLanguages` : normaliser la branche anon/bot
   (`normalizeLanguageCode(participant.language) ?? participant.language.toLowerCase()`).
2. **(B)** Écriture :
   - `validation.ts` : extraire un schema Zod réutilisable `supportedLanguageCode`
     (`.refine(isSupportedLanguage).transform(c => c.toLowerCase())`) + variantes custom ; l'appliquer
     à `AuthSchemas.register` et `updateUserProfileSchema` (DRY + normalisation).
   - `PreferencesService.updateLanguagePreferences` : lowercase system/regional/custom avant persist.
   - `anonymous.ts` : normaliser `body.language` une fois → écriture participant + gate
     `allowedLanguages` (insensible casse) + set de stats.
3. **(C)** Web : lookup catalogue + dédup **insensibles à la casse** dans `getUserLanguageChoices` /
   `getUserLanguagePreferences`.
4. **(D)** `resolveParticipantLanguage` délègue ; suppression de `resolveUserTranslationLanguages`
   (+ son test) ; suppression de la garde `if (lang)` morte dans `getRequiredLanguages`.

### Expected benefits
- Zéro cible de traduction dupliquée/non-cassée sur le chemin anonyme → zéro manqué de traduction
  Prisme, moins de compute translator.
- Base auto-cohérente (lowercase à l'écriture) → fin de la dette de re-patch F62.
- Label/drapeau web corrects pour toute casse.
- Un seul résolveur de langue faisant autorité (SSOT), un piège dead-code en moins.

### Implementation complexity
Faible. Transforms Zod triviaux, `.toLowerCase()` sur des chaînes gardées, délégation d'une fonction
sans appelant prod. Aucun changement de contrat public (types inférés inchangés).

### Validation criteria
- [ ] RED d'abord : anon `participant.language:'EN'` → `_extractConversationLanguages` contient
      `'en'` (pas `'EN'`) ; `updateLanguagePreferences({systemLanguage:'EN'})` persiste `'en'` ;
      register/profile via schema → `'en'` ; web `getUserLanguageChoices` sur `'EN'` → catalogue
      matché (flag/label corrects) ; `getUserLanguagePreferences(['EN','en'])` → `['en']`.
- [ ] GREEN après fix ; suites `packages/shared` + gateway (message-translation, preferences,
      anonymous, auth/register, users/profile) + web (user-language-preferences) vertes.
- [ ] `resolveParticipantLanguage` refactor reste GREEN sur `resolve-participant-language.test.ts`.
- [ ] `bun run build` shared : 0 erreur.

## Candidats écartés / reportés
- **F56b** (LOW) : likeCount absolu sur `post:reaction-added/removed` — hors thème.
- **F51b** (LOW docs), **F58** (LOW comment-reaction postType), **F60** (LOW unify extractMentions) :
  hors thème, reportés.
- Normalisation de `CommonSchemas.user.update` : non-write-path confirmé (grep) → écartée.
