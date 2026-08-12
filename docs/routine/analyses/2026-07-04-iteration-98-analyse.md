# Iteration 98 — Analyse d'optimisation (2026-07-04)

## Protocole (démarrage)
`main` @ `fdbd206` (« Merge pull request #1463 … » — HEAD au démarrage après
`git reset --hard origin/main`, working tree propre). Branche de travail
`claude/brave-archimedes-yetomr` recréée depuis `origin/main`
(`git checkout -B … origin/main`), 0 commit non-mergé à préserver.

PR ouvertes au démarrage : **#1469** (gateway — `CallSession.version` bump sur tous les
writers terminaux ; `services/gateway/src/services/CallService.ts` +
`CallCleanupService.ts`) et **#1468** (gateway — `comment_reaction` honore
`commentLikeEnabled`, F59 ; `services/gateway/src/services/notifications/NotificationService.ts`).
**Toutes deux gateway-only, disjointes** des fichiers `packages/shared` ciblés ici — laissées à
leurs sessions.

Le backlog F-series est quasi épuisé (F51→F58 soldés it.90→97 ; F59 en cours dans PR #1468). Cible
retenue : **F62** — pré-évalué it.97 comme LOW « à confirmer live vs latent ». Confirmation faite
ce cycle : **le drift est live-capable** (voir Root cause). Purement `packages/shared`, vérifiable
en vitest.

## Cible : F62 — `resolveUserLanguage` renvoie les préférences in-app **brutes** (`'EN'`) là où `resolveUserLanguagesOrdered` les **lowercase** (`'en'`)

### Current state
`packages/shared/utils/conversation-helpers.ts` expose deux résolveurs sœurs du Prisme
Linguistique, censés répondre à la même question « quelle langue pour cet utilisateur ? » :

1. **`resolveUserLanguagesOrdered`** (liste ordonnée, sans fallback) — **lowercase** chaque
   candidat de préférence in-app avant déduplication (`c.toLowerCase()`, ligne 83). Consommée par le
   **pipeline de traduction** : `MessageTranslationService.ts:777` (cibles de traduction envoyées au
   translator → `MessageTranslation.targetLanguage` stocké **en minuscules**), `AuthHandler.ts:174`
   et `resolved-languages-refresh.ts:26` (les `resolvedLanguages` du socket).

2. **`resolveUserLanguage`** (top-priority + fallback `'fr'`) — renvoyait les 3 préférences in-app
   **verbatim** (`return user.systemLanguage`, sans normalisation ; seul le `deviceLocale` passait
   par `normalizeLanguageCode`, lui-même lowercase). Consommée par
   `routes/conversations/messages.ts:918` → **`meta.userLanguage`** (l'indice de langue d'affichage
   que le SDK iOS et le web utilisent pour sélectionner la traduction à montrer),
   `NotificationService.ts:445/457` (langue du corps de notification i18n) et `middleware/auth.ts:305`.

`resolveParticipantLanguage` (même fichier) présentait le **même** défaut sur ses 3 retours de
préférence in-app.

### Problems identified
- **Violation silencieuse du Prisme (règle critique #1)** : les traductions sont stockées avec une
  clé de langue **minuscule** (produite par `resolveUserLanguagesOrdered` → destinations envoyées au
  translator). Mais `meta.userLanguage` renvoyait la casse **brute** de la préférence. Un
  utilisateur dont `systemLanguage` est stocké `'EN'` recevait `meta.userLanguage: 'EN'`, le client
  cherchait une traduction `'EN'`, ne trouvait que la clé `'en'` → **retombait sur le contenu
  original** au lieu de la traduction. Exactement le fallback interdit par la règle #1.
- **Notification dans la mauvaise langue** : `NotificationService` sélectionne le dictionnaire i18n
  du corps de notification avec la sortie de `resolveUserLanguage`. Une clé `'EN'` manque le
  dictionnaire keyé en minuscules → fallback langue par défaut.
- **Doublons de cibles de traduction** : `getRequiredLanguages` (qui délègue à `resolveUserLanguage`)
  construisait un `Set` de destinations. Deux membres stockés `'EN'` et `'en'` — même destination
  réelle — produisaient **deux** entrées, dont `'EN'` ne matchera jamais une traduction (requête de
  traduction gaspillée : bande passante + CPU translator).
- **Drift intra-module** : deux résolveurs voisins du **même** module encodaient deux politiques de
  casse différentes pour la même donnée. Aucune source de vérité unique pour « quelle casse a un
  code de langue résolu ».

### Root cause
La validation d'écriture des préférences (`isSupportedLanguage`,
`packages/shared/utils/languages.ts:1220`) fait `code.toLowerCase().trim()` **uniquement pour le
lookup** — elle **accepte** donc `'EN'`, `'FR'`, `'De'` comme valides mais **ne transforme jamais**
la valeur. Les points d'écriture (`routes/auth/register.ts:115`,
`PreferencesService.updateLanguagePreferences:369`) persistent la valeur **verbatim**. La casse
n'est donc **pas garantie minuscule en base**. Côté lecture, `resolveUserLanguagesOrdered`
compensait (lowercase), `resolveUserLanguage` / `resolveParticipantLanguage` non → drift live dès
qu'un client envoie un code non-minuscule.

### Business impact
Sur un produit dont le Prisme Linguistique est le principe fondateur, un utilisateur peut voir du
contenu **non traduit** (ou des notifications dans la mauvaise langue) uniquement parce que sa
préférence a été stockée en majuscules par un client — panne invisible, non diagnosticable côté
utilisateur, sur le cœur de l'expérience produit.

### Technical impact
Le fix normalise **à la lecture** (résolveur = source de vérité unique du Prisme), donc il répare
aussi les données **déjà stockées** en casse mixte, sans migration. La correction se propage
automatiquement à tous les consommateurs, y compris le web qui délègue à `resolveUserLanguage`
(`apps/web/utils/user-language-preferences.ts:68`).

### Risk assessment
Très faible. `.toLowerCase()` sur un code déjà minuscule (le cas nominal) est un **no-op** — aucune
sortie ne change pour les données correctes. Aucune signature, import ou contrat public modifié.
Aucun test consommateur (web/gateway) n'assertait une préservation de casse (grep : zéro littéral de
préférence en majuscule dans les tests web/gateway).

### Proposed improvements
`resolveUserLanguage` et `resolveParticipantLanguage` lowercasent leurs 3 retours de préférence
in-app (`user.systemLanguage.toLowerCase()`, etc.), **parité stricte** avec
`resolveUserLanguagesOrdered`. Les chemins `deviceLocale` (déjà normalisé) et fallback (`'fr'` /
`participant.language`) sont inchangés.

### Expected benefits
- Zéro manqué de traduction dû à la casse — `meta.userLanguage` matche toujours la clé minuscule.
- Notifications toujours dans la bonne langue.
- Déduplication correcte des cibles de traduction dans `getRequiredLanguages` (`'EN'`+`'en'` → 1).
- Parité de casse totale entre les 3 résolveurs de langue du module — une seule politique de casse.

### Implementation complexity
Triviale (6 `.toLowerCase()` sur des chaînes déjà non-null-gated). Aucun changement de signature,
d'import ou de contrat public.

### Validation criteria
- [x] Tests RED d'abord : `resolveUserLanguage({ systemLanguage: 'EN' })` attendu `'en'`, observé
      `'EN'` avant le fix (+ variantes regional/custom, `resolveParticipantLanguage`, et dédup
      `getRequiredLanguages(['EN','en'])` attendu `['en']`).
- [x] GREEN après fix : `conversation-helpers.test.ts` 83/83, `resolve-participant-language.test.ts`
      18/18.
- [x] Non-régression : suite `packages/shared` complète **1265/1265** verte (1258 + 7 nouveaux).
- [x] `bun run build` shared (tsc) : 0 erreur.
- [x] Aucun test consommateur (web/gateway) n'assertait la casse brute (grep vide).

## Candidats écartés ce cycle (documentés)
- **F59** (REST comment-like vs socket comment-reaction opt-out) : **en cours dans PR #1468** —
  laissé à sa session.
- **Normalisation à l'écriture** (lowercase des préférences dans `register.ts` /
  `PreferencesService`) : écartée comme fix primaire — plus large (multi-routes), ne répare **pas**
  les données déjà stockées, et le résolveur est le choke-point unique (Single Source of Truth). La
  normalisation lecture est le fix défensif et rétro-compatible. Reportée comme durcissement
  optionnel (F63).

## Améliorations futures (report)
- **F51b** (LOW) : réécriture des docs `notifications/` (composition défunte, module fantôme).
- **F56b** (LOW) : symétriser le gateway pour émettre un `likeCount` absolu sur
  `post:reaction-added/removed`.
- **F60** (LOW) : unifier les 4 `extractMentions` (casse + support `-` dans les handles).
- **F63** (LOW, neuf) : normaliser (lowercase) les préférences de langue **à l'écriture**
  (`register`, `PreferencesService`) — durcissement défense-en-profondeur redondant avec le fix
  lecture de ce cycle, à faire seulement si une itération touche déjà ces routes.
