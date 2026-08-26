# Iteration 238 — Plan : brique partagée `msRange` + fermeture du trou `playbackStretch` + réparation collision docs 236

## Objectifs
1. **DRY / SSOT** : extraire l'invariant temporel `endMs ≥ startMs` (recopié verbatim sur deux
   sites) dans une brique partagée `@meeshy/shared/utils/time-range`.
2. **Bug fix** : appliquer l'invariant au troisième porteur du couple `startMs/endMs`,
   `playbackStretch` (`messages-schemas.ts`), qui en était dépourvu.
3. **Hygiène docs** : réparer la collision de numéro d'itération 236 sur `main` (deux documents
   concaténés par un merge add/add), en renumérotant le travail CanvasV3 en 237.

## Modules affectés
- `packages/shared/utils/time-range.ts` — **nouveau** : `isMsRangeOrdered` + `MS_RANGE_REFINEMENT`.
- `packages/shared/utils/index.ts` — export du baril.
- `packages/shared/__tests__/utils/time-range.test.ts` — **nouveau** : 4 tests unitaires.
- `packages/shared/utils/attachment-validators.ts` — `transcriptionSegmentSchema` consomme la brique.
- `services/gateway/src/validation/call-schemas.ts` — `socketTranscriptionSegmentSchema` idem.
- `services/gateway/src/validation/messages-schemas.ts` — `playbackStretch` GAGNE l'invariant.
- `services/gateway/src/__tests__/unit/validation/messages-schemas.test.ts` — 2 tests (rejet
  inversé, acceptation ponctuelle).
- `docs/routine/{analyses,plans}/2026-08-20-iteration-236-*.md` — tronqués à la version transcription.
- `docs/routine/{analyses,plans}/2026-08-20-iteration-237-*.md` — **nouveaux** : version CanvasV3
  extraite + note de renumérotation.

## Phases
1. **Réparation docs** — Split des fichiers 236 concaténés : transcription reste 236, CanvasV3 → 237.
2. **Brique + test RED** — `time-range.ts` + son test unitaire (vert dès la création, brique pure).
3. **Refactor shared** — `transcriptionSegmentSchema` consomme la brique (import `.js` explicite,
   garde ESM). Rebuild shared. Suite `attachment-validators` reste verte (comportement identique).
4. **RED gateway** — Test `playbackStretch` rejette `endMs < startMs` via `AttachmentStatusBodySchema`.
   Rouge confirmé (l'inversion passait).
5. **GREEN gateway** — `playbackStretch` + `socketTranscriptionSegmentSchema` consomment la brique.
6. **Validation** — suites shared (2332) + gateway (744 + 259 consumer) + tsc + garde ESM.

## Dépendances
- Aucun changement de types externes (`z.infer` inchangé).
- Aucun changement de comportement pour les données valides existantes.
- Aucune migration DB.

## Risques estimés
- **Négligeable.** Refactors prouvés identiques par suites existantes ; durcissement `playbackStretch`
  sans aucun fixture/test inversé préexistant. `MS_RANGE_REFINEMENT` partagé = sûr (Zod ne mute pas
  `path`).

## Stratégie de rollback
- `git revert` du commit unique. La brique n'est consommée que par les 3 sites ; les retirer
  restaure les copies inline (ou l'absence, pour `playbackStretch`).

## Critères de validation
- [x] RED `playbackStretch` prouvé (inversion acceptée avant fix).
- [x] Brique `time-range.test.ts` : 4/4.
- [x] `attachment-validators` : 39/39 (refactor identique).
- [x] Gateway `messages-schemas|call-schemas|CallEventsHandler` : 744/744.
- [x] `MessageReadStatusService` (consumer stretches) : 259/259.
- [x] Shared vitest complet : 2332/2332.
- [x] `tsc --noEmit` propre (shared + gateway).
- [x] Garde `esm-relative-imports` verte.
- [x] Docs 236 réparés (transcription seule) + 237 extraits (CanvasV3).
- [ ] CI verte sur la PR (gate lint/bun réel).

## Statut d'achèvement
**Complet.** Brique posée, 3 sites migrés (dont 1 bug fixé), collision docs réparée. Aucune
régression locale.

## Progression
1. ✅ Réparation collision docs (236 = transcription, 237 = CanvasV3)
2. ✅ Brique `time-range.ts` + test
3. ✅ Refactor `transcriptionSegmentSchema`
4. ✅ RED/GREEN `playbackStretch`
5. ✅ Refactor `socketTranscriptionSegmentSchema`
6. ✅ Validation complète + fix garde ESM

## Améliorations futures
1. **CanvasV3 `TimingSchema`/`bounds`** (itération 237) : même invariant, noms `start`/`end`
   (secondes) et bornes optionnelles → brique jumelle/générique à peser.
2. **Parité Pydantic translator** : `TranscriptionSegment` (`@dataclass`) sans invariant — reprendre
   translator-ready.
3. **Monotonie inter-segments/stretches** — arbitrage produit requis (diarisation entrelacée).
