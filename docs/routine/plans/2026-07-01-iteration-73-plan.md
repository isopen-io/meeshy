# Iteration 73 — Plan d'implémentation (2026-07-01)

## Objectif
Converger les réimplémentations locales de l'algorithme d'horloge (`formatDuration` MM:SS / H:MM:SS) vers la
source unique `formatClock` (`packages/shared/utils/duration-format.ts`), en préservant le comportement.

## Modules affectés (apps/web)
- `components/video/CompactVideoPlayer.tsx`
- `components/video-calls/OngoingCallBanner.tsx`
- `components/audio/AudioEffectsTimelineView.tsx`
- `app/dashboard/LastMessagePreview.tsx`

## Phases
1. **Analyse d'équivalence** — comparer chaque copie locale au contrat `formatClock` (unités s vs ms,
   gestion des heures, centièmes, garde `!finite`). ✅
2. **Conversion** — import `formatClock` depuis `@meeshy/shared/utils/duration-format` ; remplacer le corps
   local par une délégation ; supprimer le paramètre mort `includeHours` (LastMessagePreview) et nettoyer le
   site d'appel. ✅
3. **Validation** — `jest` sur les suites des composants touchés ; `tsc --noEmit` diff baseline. ✅

## Dépendances
- `@meeshy/shared` doit être buildé en `dist/` pour que le jest mapping `@meeshy/shared/* → dist/*` résolve
  (`cd packages/shared && bun run build`). Prérequis CI standard.

## Risques & mitigations
- **Changement de comportement ≥ 1 h** (`OngoingCallBanner`) : assumé comme **correction** (rollover d'heures).
  Aucun test n'assertait de durée ≥ 1 h. Risque nul en pratique.
- **Unités ms vs s** : `formatClock` attend des **secondes** ; toutes les sources ms passent `ms / 1000`.
  `formatClock` refait un `Math.floor(seconds*1000)` interne → équivalence exacte pour ms entiers.
- **Paramètre `includeHours` supprimé** : vérifié inutilisé (2 sites d'appel = `true`).

## Stratégie de rollback
Révert du commit unique ; changements isolés à 4 fichiers + 2 docs, aucune migration ni schéma.

## Critères de validation
- [x] Tests jest des composants touchés : verts (36 + 88 + 95).
- [x] `tsc --noEmit` apps/web : baseline stable (1198 → 1198, 0 erreur neuve).
- [x] Aucune copie locale résiduelle de l'algorithme d'horloge dans les 4 fichiers ciblés.

## Statut : COMPLET

## Améliorations futures (voir tableau « Consignés » de l'analyse)
- F32-reste : `AttachmentDetails.tsx`, `AudioPostComposer.tsx` (même conversion ms→`formatClock`).
- F32-humain : source unique distincte pour les durées **humaines** (j/h/min) des modales admin agent.
