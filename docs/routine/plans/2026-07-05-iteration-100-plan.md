# Iteration 100 — Plan d'implémentation (2026-07-05)

## Objectifs
Rendre les usernames à tiret (`@marie-claire`) pleinement fonctionnels dans le système de mentions
(extraction, résolution, notification, rendu, autocomplete, interpellation de bot) via une SSOT
`MENTION_HANDLE_CHARS`. Unifier les 4 `extractMentions` (F60).

## Modules affectés
- `packages/shared/utils/mention-parser.ts` (SSOT + parseMentions + hasMentions)
- `packages/shared/types/mention.ts` (extractMentions, mentionsToLinks, isValidMentionUsername,
  MENTION_CONSTANTS)
- `services/gateway/src/services/MentionService.ts` (MENTION_REGEX, USERNAME_VALIDATION_REGEX,
  resolveMentionedUsers)
- `services/gateway/src/middleware/rate-limiter.ts` (validateMentionCount)
- `apps/web/utils/mention-display.ts`, `apps/web/hooks/composer/useMentions.ts`,
  `apps/web/services/{mentions,messages}.service.ts`
- `services/agent/src/reactive/interpellation-detector.ts`
- Tests : shared (`mention-parser.test.ts`, `mention-extract.test.ts` nouveau), gateway
  (`MentionService.test.ts`), agent (`interpellation-detector.test.ts`), web
  (`mentions.service.test.ts`)

## Phases
1. **RED** — écrire les tests d'échec (hyphen resolution/extraction/links/validation, bot à tiret).
2. **SSOT** — `MENTION_HANDLE_CHARS = '\\w-'` + `NAME_CHAR` avec tiret dans `mention-parser.ts`.
3. **GREEN shared** — propager à `types/mention.ts`.
4. **GREEN gateway** — MentionService (2 regex + validation) + rate-limiter ; MAJ test buggy
   `@john-doe`.
5. **GREEN web** — délégation des 2 `extractMentions` à la SSOT + mention-display + autocomplete.
6. **GREEN agent** — interpellation-detector.
7. **Validation** — vitest shared, jest gateway/agent/web sur les suites touchées ; `tsc` shared.

## Dépendances
- `bun install --ignore-scripts` + `prisma generate --generator client` (parité CI) — fait.

## Risques estimés
- Faible. Capture gloutonne du tiret : `@user-mot` (user seul participant) n'est plus résolu comme
  `user` — jugé plus correct. Aucun contrat public modifié.

## Stratégie de rollback
Revert du commit unique ; tout est additif/défensif, aucune migration.

## Critères de validation
Voir analyse §Validation criteria. Tous vérifiés localement (hors suite pré-cassée par le stub
`@prisma/client`, reproduite sur `main`).

## Statut de complétion
- [x] Phase 1 RED
- [x] Phase 2 SSOT
- [x] Phase 3 shared
- [x] Phase 4 gateway
- [x] Phase 5 web
- [x] Phase 6 agent
- [x] Phase 7 validation

## Suivi de progression
Terminé. Diff : 13 fichiers modifiés + 1 nouveau test shared (`mention-extract.test.ts`).

## Améliorations futures
- **F60b** : parité du charset mention iOS (`MeeshySDK`) + Android (validation toolchain-native).
- **F51b**, **F56b** : reports antérieurs inchangés.
