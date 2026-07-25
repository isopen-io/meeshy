# Plan — Iteration 208 : convergence du formatage d'octets sur le SSOT `formatFileSize`

## Objectifs
Éliminer les 3 formatages d'octets inline (division `/1024` figée sur KB) des
composants d'affichage web au profit du SSOT `formatFileSize`
(`packages/shared/types/attachment.ts`), corrigeant l'absence de roulage
d'unités (MB/GB) et la précision incohérente.

## Modules affectés
- `apps/web/components/attachments/carousel/AudioFilePreview.tsx`
- `apps/web/components/audio/AudioRecorderCard.tsx`
- `apps/web/app/admin/messages/page.tsx`
- `apps/web/__tests__/components/attachments/carousel/AudioFilePreview.test.tsx` (nouveau)
- `apps/web/__tests__/components/audio/AudioRecorderCard.test.tsx` (assertion amendée)

## Phases
1. **RED** — écrire `AudioFilePreview.test.tsx` : 3 Mo → « 3 MB », 512 o → « 512 B »,
   52428 o → « 51.2 KB ». Prouver l'échec sur le code actuel (« 3072 KB » / « 0 KB »).
2. **GREEN** — recâbler les 3 composants sur `formatFileSize` (import + substitution).
3. **Ajuster** — l'assertion `AudioRecorderCard` `/KB/i` → `/\d+(\.\d+)?\s*(B|KB|MB)\b/i`
   (le mock blob ~20 o rend désormais « 20 B », pas « 0 KB »).
4. **Valider** — suites attachments + audio, tsc.

## Dépendances
Aucune. Le SSOT `formatFileSize` existe déjà et est importé par 10 composants.

## Risques estimés
Faible. Web-only, aucun schéma/API/i18n. Changement de rendu **intentionnel**
(unités roulées). Régression couverte par les nouveaux tests.

## Stratégie de rollback
Revert du commit (3 composants + 2 tests). Aucun état persistant, aucune migration.

## Critères de validation
- `AudioFilePreview.test.tsx` : 3/3 verts (RED prouvé avant fix).
- `AudioRecorderCard.test.tsx` : 26/26 verts.
- Suites attachments + audio : 455 verts / 0 échec.
- `tsc --noEmit` : 0 erreur sur les fichiers touchés.

## Statut de complétion
✅ **Complété.** RED prouvé → GREEN → régression verte → tsc clean.

## Suivi de progression
- [x] Phase 1 RED
- [x] Phase 2 GREEN (3 composants)
- [x] Phase 3 assertion AudioRecorderCard
- [x] Phase 4 validation (455 tests, tsc)

## Améliorations futures
Voir la section « Future improvements » de l'analyse 208 :
`getUserDisplayName` (duplication), formatage d'octets en logs
(`useAttachmentUpload`, `user-analytics-collector`).
