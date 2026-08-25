# Itération 264 — Plan d'implémentation

## Objectives
Consolider le garde-fou du plafond de réactions (dupliqué VERBATIM dans 5 services
du gateway) en une garde unique `assertReactionAllowed`, miroir exact de
`assertValidObjectId`. Behavior-preserving.

## Affected modules
- **Neuf** : `services/gateway/src/utils/reaction-limit-guard.ts`
- **Neuf** : `services/gateway/src/utils/__tests__/reaction-limit-guard.test.ts`
- **Modifiés** (import + 1 bloc → 1 appel) :
  - `services/gateway/src/services/ReactionService.ts`
  - `services/gateway/src/services/PostReactionService.ts`
  - `services/gateway/src/services/CommentReactionService.ts`
  - `services/gateway/src/services/AttachmentReactionService.ts`
  - `services/gateway/src/services/PostCommentService.ts`

## Implementation phases
1. **RED** — écrire `reaction-limit-guard.test.ts` (module inexistant ⇒ échec). ✅
2. **GREEN** — créer `reaction-limit-guard.ts` (`assertReactionAllowed` consommant
   le prédicat + le message partagés, jetant `ConflictError`). ✅
3. **REFACTOR** — remplacer les 5 blocs `if (!isReactionAllowed(...)) { throw ... }`
   par `assertReactionAllowed(existingReactionCount);` ; retirer les imports shared
   devenus inutiles ; conserver `ConflictError` (utilisé ailleurs partout). ✅

## Dependencies
Aucune. Le prédicat `isReactionAllowed` et le message existent déjà en shared.

## Estimated risks
Très faibles. Aucun changement de type inféré, aucun changement de comportement
runtime. Le seul axe de vigilance — un import shared laissé orphelin — vérifié à 0.

## Rollback strategy
Revert du commit unique.

## Validation criteria
- [x] RED prouvé.
- [x] GREEN : garde 4/4.
- [x] `tsc --noEmit` gateway : 0 erreur.
- [x] 13 suites / 340 tests des services de réaction verts.
- [ ] CI verte sur la PR.

## Completion status
**Implémenté et validé localement.** En attente CI.

## Progress tracking
- Phase 1 (RED) ✅
- Phase 2 (GREEN) ✅
- Phase 3 (REFACTOR 5 sites) ✅
- Validation locale ✅
- CI ⏳

## Future improvements (report des candidats non retenus ce cycle)
- **`decodeCursor` validation de type** (`utils/keyset-cursor.ts`) : ne vérifie que
  la véracité (`data.createdAt && data.id`), pas le TYPE, avant de caster en
  `CursorData` et de composer un filtre Prisma `Date`. Gap de validation, sévérité
  limitée (curseurs server-mintés). Candidat itération suivante.
# Itération 264 — Plan : durcir `decodeCursor` contre la confusion de TYPE

## Objectifs

1. `decodeCursor` (`services/gateway/src/utils/keyset-cursor.ts`) doit rendre
   `null` pour toute charge dont `createdAt`/`id` ne sont pas des **chaînes**, ou
   dont `createdAt` ne se **parse pas** en date valide — au lieu de laisser la
   valeur atteindre `keysetBeforeClause` puis Prisma (500).
2. Renvoyer un `CursorData` **reconstruit** (`{ createdAt, id }`), sans clé
   excédentaire.

## Modules affectés

- `services/gateway/src/utils/keyset-cursor.ts` — garde étendu (comportement
  préservé sur les curseurs légitimes).
- `services/gateway/src/__tests__/unit/routes/posts/types.test.ts` — 6 gardes
  ajoutées au bloc `decodeCursor`.

## Phases

### Phase 1 — RED
Ajouter les gardes : `id` objet, `id` nombre, `createdAt` nombre, `createdAt`
non-datable, JSON non-objet, reconstruction sans clé parasite. Prouver le rouge
(`5 failed`).

### Phase 2 — GREEN
Étendre le garde : objet non-nul + `typeof === 'string'` sur les deux champs +
`!Number.isNaN(new Date(createdAt).getTime())`, puis `return { createdAt, id }`.

### Phase 3 — Validation
- `types.test.ts` → 71/71.
- `PostFeedService` + `PostCommentService` → 129/129.
- `tsc --noEmit` gateway → 0.
- Full gateway suite → baseline.

## Dépendances

Aucune. `CursorData` inchangé, aucun type inféré ne bouge.

## Risques estimés

**Faible.** Une entrée malformée rend `null` (reprise en tête) au lieu de lever —
strictement une amélioration. Rollback : revert du commit unique.

## Stratégie de rollback

Revert du commit unique.

## Critères de validation

- [x] RED prouvé (5 échecs avant fix).
- [x] GREEN `types.test.ts` (71/71).
- [x] Consommateurs de curseur inchangés (129/129).
- [x] `tsc --noEmit` gateway (0 erreur).
- [x] Full gateway suite (861/861 suites, 19574/19574 tests, exit 0).
- [ ] Commit + push.

## Statut de complétion

- [x] RED écrit et prouvé.
- [x] GREEN posé.
- [x] Validations ciblées vertes.
- [x] Full suite (861/861, exit 0).
- [ ] Commit + push.

## Suivi de progression

Voir l'analyse : `docs/routine/analyses/2026-08-24-iteration-264-analyse.md`.

## Améliorations futures

- **`decodeCursor` — borne de longueur** sur la chaîne base64url d'entrée avant
  décodage (garde-fou mémoire contre un curseur géant), si un profil de charge le
  justifie.
- **`assertReactionAllowed(count)`** — le throw `ConflictError` +
  `isReactionAllowed` est recopié dans 5 services ; consolider le COUPLE
  count+throw derrière un helper unique (`isReactionAllowed` l'est déjà, le throw
  ne l'est pas).
