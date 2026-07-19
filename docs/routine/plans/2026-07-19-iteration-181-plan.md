# Plan — Iteration 181 : borner le cache de debounce du middleware `deviceLocale`

## Objectifs
Supprimer la fuite mémoire non bornée du cache de debounce
(`lastUpdateByUserId`) en garantissant par construction une empreinte ≤
`MAX_TRACKED_USERS`, sans changer le comportement de debounce sous charge
nominale.

## Modules affectés
- `services/gateway/src/middleware/deviceLocale.ts` (production)
- `services/gateway/src/__tests__/unit/middleware/deviceLocale.test.ts` (tests)

## Phases d'implémentation
1. **RED** — 3 tests d'éviction (cap franchi → purge des expirées ; toutes
   fraîches → borne dure ; sous plafond → pas de purge). Seams de test
   `_deviceLocaleCacheSize` / `_DEVICE_LOCALE_MAX_TRACKED_USERS`.
2. **GREEN** — `MAX_TRACKED_USERS` + `pruneStaleDebounceEntries(now)` (sweep
   expirées puis borne dure FIFO) ; garde amortie sur le chemin d'écriture.
3. **REFACTOR** — docstrings ; aucune duplication introduite.

## Dépendances
Aucune (constantes locales, `Map` native).

## Risques estimés
Très faible : purge limitée aux entrées expirées (préservation stricte) ;
plafond dur uniquement en cas pathologique (>10k users/5 min → 1 update
idempotente en trop). Coût O(n) amorti, hors hot path nominal.

## Stratégie de rollback
Revert du commit unique — le middleware retrouve son comportement précédent
(fuite lente incluse) sans effet de bord.

## Critères de validation
- `deviceLocale.test.ts` : 17/17 verts.
- `tsc --noEmit` : 0 nouvelle erreur.

## Statut de complétion
- [x] Phase 1 RED
- [x] Phase 2 GREEN
- [x] Validation — `deviceLocale.test.ts` **17/17** verts ; `tsc --noEmit`
      gateway : 0 erreur sur `deviceLocale.ts` (seule erreur résiduelle
      `sanitize.ts`/`@meeshy/shared` = dist shared non buildée, environnementale
      et préexistante, sans lien avec ce changement).
- [x] Commit + push

## Améliorations futures
- Étendre la purge amortie aux autres caches de processus non bornés du
  gateway s'il en existe (audit dédié).
- Backlog inchangé (voir analyse 181).
# Plan d'implémentation — Itération 181

## Objectifs
Brancher `ReactionService.getMessageReactions` sur la SSOT
`resolveParticipantDisplayName` / `resolveParticipantAvatar` (avec jointure du
compte lié) afin que l'identité d'un réacteur enregistré (nom + avatar) soit
cohérente avec le fil de messages et ne retombe plus sur `'Anonymous'` / avatar
absent, tout en supprimant la fuite chaîne-vide.

## Modules affectés
- `services/gateway/src/services/ReactionService.ts` (import + `select` + enrichissement)
- `services/gateway/src/__tests__/unit/services/ReactionService.test.ts` (RED)

## Phases
1. **RED** — +5 tests dans le describe `getMessageReactions` : fallback compte,
   priorité local, blank→absent, ni l'un ni l'autre→`'Anonymous'`/`null`,
   jointure `user` dans le `select`. ✅
2. **GREEN** — import des helpers ; jointure `user: { select: { displayName,
   avatar } }` ; `resolveParticipantDisplayName(participant) ?? 'Anonymous'` +
   `resolveParticipantAvatar(participant)`. ✅
3. **Validation** — jest `ReactionService` + suites consommatrices
   `ReactionHandler|reactions`. ✅

## Dépendances
`@meeshy/shared/utils/participant-helpers` — déjà en production (importé par
`routes/conversations/messages.ts`). `prisma generate --generator client` requis
pour que ts-jest résolve les types Prisma (étape CI parité).

## Risques estimés
Très faibles — helpers idempotents déjà déployés ; type de retour inchangé ;
comportement identique pour les participants anonymes.

## Stratégie de rollback
Revert du commit unique de l'itération.

## Critères de validation
- `ReactionService.test.ts` 83/83 (5 nouveaux).
- `ReactionHandler|reactions` 508/508 (15 suites).

## Statut
**COMPLETE** — implémenté et validé.

## Suivi de progression
- [x] RED (5 tests)
- [x] GREEN (import + select + enrichissement)
- [x] Validation jest (83 + 508)
- [x] Analyse + plan
- [ ] Commit + push

## Améliorations futures
- Voir backlog de l'analyse 181 : `CommentReactionService.ts:247-248`,
  `routes/conversations/stats.ts:77-78`, `participants.ts:541` (fuites
  chaîne-vide niveau compte, RED-first dans une itération dédiée).
