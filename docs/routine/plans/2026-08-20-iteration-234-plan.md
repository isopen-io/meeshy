# Plan d'implémentation — Iteration 234

## Objectifs
Compléter le contrat de `transcriptionSegmentSchema` avec l'invariant temporel `endMs >= startMs`,
manquant alors que chaque borne était déjà contrainte `nonnegative`.

## Modules affectés
- `packages/shared/utils/attachment-validators.ts` (source — schéma de segment de transcription,
  frontière de confiance des payloads d'attachements).
- `packages/shared/__tests__/attachment-validators.test.ts` (tests).

## Phases d'implémentation
1. **RED** — ajouter deux tests : `endMs < startMs` doit être rejeté (rouge attendu),
   `endMs === startMs` (durée nulle) doit rester accepté (vert immédiat — garde anti-sur-durcissement).
2. **GREEN** — envelopper `z.object({...})` dans `.refine((s) => s.endMs >= s.startMs, { message,
   path: ['endMs'] })`. Confirmer 39/39.
3. **REFACTOR** — aucun. Correctif minimal et local.

## Dépendances
- Aucune. Fonction pure, aucun changement d'API/type public/contrat réseau. `z.infer` inchangé.

## Risques estimés
- Négligeable. Aucun usage object-only (`.extend`/`.shape`/`.merge`/`.pick`) sur le schéma ; usages =
  `z.array(...)` uniquement, compatibles `ZodEffects`. Aucun fixture existant ne viole l'invariant.
  Rejet gracieux (safeParse ne throw pas).

## Stratégie de rollback
- Revert du commit unique. Zéro migration, zéro état persistant modifié.

## Critères de validation
- [x] RED prouvant l'acceptation actuelle de `endMs < startMs`.
- [x] GREEN après refine (39/39 `attachment-validators`).
- [x] Non-régression durée nulle (`endMs === startMs`) verte.
- [x] Suite shared complète : 2314/2314.
- [x] `bun run build` (tsc strict) propre.
- [ ] CI verte sur la PR.

## Statut de complétion
- **Implémenté et validé localement.** En attente CI.

## Suivi de progression
- Refine appliqué, tests verts, dist reconstruit (`tsc`), docs écrites, commit + push branche.

## Améliorations futures (hors périmètre de cette itération)
- Parité Pydantic `end_ms >= start_ms` côté `services/translator` (émetteur des segments).
- Contrainte de monotonie inter-segments (`segments[i].startMs >= segments[i-1].startMs`) — à peser
  séparément (diarisation entrelacée possible).
- Candidats 233 non retenus : markdown attachments → viewer texte (arbitrage produit) ; dette de
  type `deletedConversationIds` sur les pages du cache infini.
