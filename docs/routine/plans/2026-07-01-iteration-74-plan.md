# Iteration 74 — Plan d'implémentation (2026-07-01)

## Objectifs
Clore la convergence F32 (algorithme d'horloge MM:SS / H:MM:SS) côté web : éliminer les 2 dernières
réimplémentations locales de `formatDuration` au profit de la source unique `formatClock`, et retirer
1 copie morte.

## Modules affectés
- `apps/web/components/attachments/AttachmentDetails.tsx`
- `apps/web/components/v2/AudioPostComposer.tsx`
- `apps/web/components/video-calls/CallStatusIndicator.tsx`

## Phases
1. **AttachmentDetails** — import `formatClock` ; `formatDuration(ms)` délègue `formatClock(ms/1000)`
   (drop-in strictement équivalent). ✅
2. **AudioPostComposer** — import `formatClock` ; `formatDuration(ms)` délègue `formatClock(ms/1000)`
   (bugfix rollover heures). ✅
3. **CallStatusIndicator** — suppression de `_formatDuration` (dead code, jamais appelé). ✅

## Dépendances
- Source de vérité `packages/shared/utils/duration-format.ts` (déjà en place, iter 42).
- Aucune modification de schéma / API / socket.

## Risques estimés
Faible. Comportement préservé (`AttachmentDetails`), corrigé (`AudioPostComposer` ≥ 1 h), pur retrait
(`CallStatusIndicator`). Imports mirroring 6 call-sites verts sur `main`.

## Stratégie de rollback
`git revert` du commit — changements confinés à 3 fichiers de présentation, aucun état persistant.

## Critères de validation
- [x] `jest` `AttachmentDetails.test.tsx` + `audio-post-composer.test.tsx` → 60/60 verts.
- [x] Assertions de durée inchangées.
- [x] Aucun test ne référence `CallStatusIndicator` (suppression sûre).

## Statut de complétion
**Complété.** 3 phases implémentées et validées.

## Suivi de progression
- [x] Phase 1 (AttachmentDetails)
- [x] Phase 2 (AudioPostComposer)
- [x] Phase 3 (CallStatusIndicator dead code)
- [x] Tests verts
- [x] Analyse + plan écrits

## Améliorations futures
- F32-humain : source unique pour durée humaine (j/h/min) des modales admin agent, si le besoin se
  matérialise (sémantique distincte de l'horloge).
- F31 : dédup `truncateText`.
- F2 : flip `SOCKET_LANG_FILTER` (validation staging requise, non autonome).
