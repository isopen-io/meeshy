# Iteration 143 — Analyse d'optimisation (2026-07-08)

## Protocole (démarrage)
`main` @ `dff061e` (dernier merge, PR #1661 mergée). Branche `claude/brave-archimedes-bnk9u7` recréée depuis
`origin/main`. Ce cycle prend **143** et exécute **F110**, la piste explicitement reportée par l'iter 142
(« injecter `deviceLocale` dans `getUserLanguagePreferences` — parité `resolveUserLanguagesOrdered` »).
Priorité 1 (feature récemment modernisée : Prisme Linguistique étendu 2026-05-26, deviceLocale 4e priorité).

## Cible : F110 — `getUserLanguagePreferences` (web) omet la `deviceLocale`, divergeant de `resolveUserPreferredLanguage`

### Current state
`apps/web/utils/user-language-preferences.ts`. Deux fonctions résolvent la langue de l'utilisateur pour le
Prisme Linguistique, mais ne partageaient pas la même échelle :

- `resolveUserPreferredLanguage(user)` (l.87) — délègue à `resolveUserLanguage()` (`@meeshy/shared`) en
  injectant la `deviceLocale` (`user.deviceLocale` persistée ?? `navigator.language`). **4 niveaux** :
  system → regional → custom → **deviceLocale**. Pilote l'**affichage** (quelle langue montrer).
- `getUserLanguagePreferences(user)` (l.96, avant fix) — ré-implémentait localement une liste ordonnée
  system → regional → custom, **sans deviceLocale**. Pilote la **demande de traduction** (via
  `getRequiredTranslations` dans `hooks/use-message-translations.ts:266` → quelles traductions requérir).

La SSOT `resolveUserLanguagesOrdered()` (`packages/shared/utils/conversation-helpers.ts:74`) produit
exactement cette liste ordonnée **avec** la deviceLocale en 4e position.

### Problems identified
Un écart de contrat entre le chemin **affichage** (4 niveaux) et le chemin **demande de traduction**
(3 niveaux) sur le même écran, plus une violation de la règle SSOT (CLAUDE.md : « Language resolution:
`resolveUserLanguage()`/`resolveUserLanguagesOrdered()` from `packages/shared/` — no reimplementation »).

### Root causes
`getUserLanguagePreferences` est antérieure au Prisme étendu (deviceLocale, 2026-05-26). Quand
`resolveUserPreferredLanguage` a été migré vers la SSOT + deviceLocale, son jumeau `getUserLanguagePreferences`
n'a pas été mis à jour — la liste des cibles de traduction est restée sur l'ancienne échelle 3-niveaux.

### Business impact
Reproductible pour tout utilisateur dont le **seul signal de langue** est la locale appareil (préférences
in-app `systemLanguage`/`regionalLanguage`/`customDestinationLanguage` vides) — cas nominal d'un compte
fraîchement créé, ou d'un utilisateur web qui n'a jamais ouvert les réglages de langue :

- `resolveUserPreferredLanguage` résout le contenu vers `deviceLocale` (ex. `it`) → l'app **affiche** en
  italien la traduction *si elle existe*.
- Mais `getUserLanguagePreferences` retournait `[]` → `getRequiredTranslations` ne demandait **jamais** de
  traduction italienne → aucune traduction `it` n'était produite → l'utilisateur voit l'**original**, pas
  sa langue de prédilection. Le Prisme est rompu précisément pour l'utilisateur qui dépend le plus de la
  deviceLocale.

Cas secondaire : utilisateur avec `systemLanguage: 'fr'` + `deviceLocale: 'it'` — les messages italiens
entrants n'étaient jamais traduits vers `it` en secours quand aucune trad `fr` n'existait, alors que
l'échelle du Prisme prévoit `it` en 4e recours.

### Technical impact
Duplication de logique de résolution (re-implémentation locale de l'échelle du Prisme) + divergence de
comportement affichage-vs-demande. Défaut de correctness silencieux : aucune erreur, juste une traduction
manquante.

### Risk assessment
Faible. 1 fichier de prod (2 fonctions convergent vers la SSOT partagée) + 1 fichier de test. Les 10 tests
existants de `getUserLanguagePreferences` restent verts (vérifié : ils mockent `getDeviceLocale → null` et
n'ont pas de `user.deviceLocale`, donc l'échelle 4-niveaux produit un résultat identique quand la
deviceLocale est absente). Seuls les cas avec deviceLocale présente changent — exactement les cas
aujourd'hui faux.

### Proposed improvements
1. Extraire un helper privé `resolveDeviceLocale(user)` — `user.deviceLocale` persistée ?? `getDeviceLocale()`
   — partagé par les deux fonctions (dé-duplique la logique de préférence persistée-vs-navigateur).
2. `getUserLanguagePreferences` délègue désormais à `resolveUserLanguagesOrdered(user, { deviceLocale })`
   (SSOT), supprimant la ré-implémentation locale.
3. `resolveUserPreferredLanguage` réutilise le même helper.

### Expected benefits
- Parité affichage ↔ demande-de-traduction : ce qui est affiché est ce qui est requis.
- Le Prisme fonctionne pour l'utilisateur dont la deviceLocale est le seul signal.
- SSOT respectée : une seule implémentation de l'échelle du Prisme (dans `@meeshy/shared`).

### Implementation complexity
Triviale : ~30 lignes remplacées par une délégation, + 5 tests de non-régression (deviceLocale persistée
appendée, fallback navigator.language, préférence persistée-vs-navigateur, deviceLocale seule, déduplication
case-insensitive de la deviceLocale).

### Validation criteria
- `apps/web/__tests__/utils/user-language-preferences.test.ts` : 41 tests verts (36 existants + 5 nouveaux).
- `apps/web/__tests__/hooks/use-message-translations.test.tsx` : 45 tests verts (consommateur, pas de
  régression).
- `tsc --noEmit` : aucune erreur nouvelle sur les fichiers touchés (les erreurs pré-existantes de
  `z-index-validator.ts`, `push-token.service.ts`, `connection.service.ts` sont hors périmètre).

## Candidats écartés ce cycle
- **F108** (nettoyage code mort `MessageValidator.checkPermissions`) — reporté à nouveau, non bloquant.
- **MediaVideoCard** (match de langue casse-sensible) — composant toujours non câblé, défaut latent.

## Prochaines pistes
- **F108** : nettoyage code mort `MessageValidator.checkPermissions` (reporté depuis iter 140).
- Vérifier la parité analogue côté iOS (`ConversationViewModel.preferredLanguages`) : la liste des cibles
  de traduction inclut-elle bien la deviceLocale en 4e priorité ?
- MediaVideoCard : aligner le match de langue sur ses jumeaux **quand** le composant sera câblé.
