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
