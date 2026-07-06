# Iteration 99 — Plan d'implémentation (2026-07-04)

## Objectifs
Solder le drift de casse des codes de langue (thème F62) à **toutes** les frontières restantes :
1 bug LIVE (pipeline de traduction, chemin anonyme), la root cause (écriture verbatim), un bug UI web,
et 2 violations SSOT/dead-code.

## Modules affectés
- `services/gateway/src/services/message-translation/MessageTranslationService.ts` (A — LIVE)
- `packages/shared/utils/validation.ts` (B — schema Zod réutilisable + normalisation)
- `services/gateway/src/services/preferences/PreferencesService.ts` (B — write DTO)
- `services/gateway/src/routes/anonymous.ts` (B — participant + gate + stats)
- `apps/web/utils/user-language-preferences.ts` (C — helpers d'énumération)
- `packages/shared/utils/conversation-helpers.ts` (D — SSOT + dead-code)
- Tests associés (shared vitest, gateway jest, web jest)

## Phases (TDD RED→GREEN par phase)
1. **(A) LIVE** — RED test anon `participant.language:'EN'` sur `_extractConversationLanguages` ;
   GREEN via normalisation de la branche anon/bot.
2. **(B) Écriture** — schema `supportedLanguageCode` (validation.ts) + register/profile ;
   `PreferencesService` lowercase ; `anonymous.ts` normalise `body.language` (write + gate + stats).
3. **(C) Web** — lookup/dedup insensibles à la casse + tests jest.
4. **(D) SSOT/dead-code** — `resolveParticipantLanguage` délègue ; suppression
   `resolveUserTranslationLanguages` (+ test) ; suppression garde morte `getRequiredLanguages`.

## Dépendances
Prisma client généré + `packages/shared` build (prérequis test parity bun). Aucune migration DB
(normalisation lecture/écriture, rétro-compatible).

## Risques estimés
Très faibles (voir Risk assessment de l'analyse). Point d'attention : ordre Zod
`.refine().transform().default()/.optional()` — `.default` court-circuite le transform sur input
`undefined` (défaut `'fr'` déjà lowercase, no-op). Transforms `string→string` : `z.infer` inchangé.

## Stratégie de rollback
Révert du commit unique — chaque frontière est additive/défensive, aucune migration à défaire.

## Critères de validation
Voir analyse. Suites vertes shared + gateway (message-translation / preferences / anonymous /
auth.register / users.profile) + web (user-language-preferences) ; `bun run build` shared OK.

## Statut
- [x] Phase 1 (A)  - [x] Phase 2 (B)  - [x] Phase 3 (C)  - [x] Phase 4 (D)  - [x] Validation  - [ ] Merge

### Résultats de validation
- `packages/shared` vitest : **1262 passed** (44 fichiers) — inclut `validation.test.ts` (schema
  transform), `conversation-helpers.test.ts` (dead-code retiré), `resolve-participant-language.test.ts`
  (délégation GREEN). `bun run build` shared : 0 erreur.
- Gateway sweep ciblé (validation|language|preference|profile|register|auth|anonymous|translation) :
  **102 suites, 2716 passed, 1 skipped, 0 failed** — inclut la normalisation anon LIVE
  (`message-translation-destinations` : `conv-cased` → `[en, es]`), `PreferencesService` (write
  lowercase), anonymous route, auth/register + profile.
- Web : `user-language-preferences.test.ts` **36 passed** (lookup + dédup insensibles à la casse,
  fallback 🇫🇷 préservé pour systemLanguage absent).
- Aucun test consommateur n'assertait une préservation de casse (grep vide) ; aucune régression.

## Améliorations futures (report)
- F56b (LOW), F51b (LOW docs), F58 (LOW), F60 (LOW) — hors thème, à traiter en itérations dédiées.
