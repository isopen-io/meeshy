# Iteration 182 — Plan : réaligner `computeStoryDurationMs` (web) sur le SSOT iOS

## Objectives
Restaurer la parité stricte du calcul de durée de story côté web avec l'autorité
Swift `StoryEffects.contentDerivedDuration` (StoryModels.swift:1039-1079), en
corrigeant trois divergences qui provoquent un auto-advance prématuré des stories
web portant de l'audio ou des clips décalés.

## Affected modules
- `apps/web/lib/story-transforms.ts` — `computeStoryDurationMs` (corps réécrit +
  helpers `finiteNumber`, `loopPeriod`, `timelineWindow`).
- `apps/web/__tests__/lib/story-transforms-extended.test.ts` — +5 tests de parité.

## Implementation phases
1. **RED** — ajout de 5 tests couvrant : audio fg, fenêtre bg audio vs bg vidéo,
   double boucle bg vidéo+audio, offset `startTime` fg (média) et audio. ✅
2. **GREEN** — réécriture du corps en miroir du SSOT Swift :
   `longestData` = max des fenêtres `(startTime ?? 0) + duration` sur tous les
   médias + audio ; `target = max(textDur, 6, longestData)` ;
   `bgLoopPeriods = [bgVideoDur, bgAudioDur]` réduits contre `target` ;
   `return max(bgResult, longestData)`. ✅
3. **VALIDATE** — 3 suites story 127/127 ; typecheck sans nouvelle erreur. ✅

## Dependencies
Aucune (fonction pure, aucune dépendance runtime nouvelle). `bun install` requis
localement pour exécuter jest (fait).

## Estimated risks
Faible : fonction pure, couverture dédiée, 10 assertions historiques préservées.
Le seul comportement modifié est l'ajout de termes (audio/offsets/2e loop) — aucun
chemin existant n'est altéré.

## Rollback strategy
Revert du commit unique (2 fichiers). Aucune migration, aucun état persistant.

## Validation criteria
- `story-transforms-extended.test.ts` 76/76 (bloc duration 15/15).
- 3 suites story 127/127.
- `tsc --noEmit` : 0 nouvelle erreur sur `story-transforms.ts`.

## Completion status
**COMPLETED** — RED + GREEN + validation exécutés, tests verts.

## Progress tracking
- [x] RED (5 tests)
- [x] GREEN (réécriture miroir SSOT)
- [x] Validation (127/127, typecheck propre)
- [x] Analyse + plan documentés
- [ ] Commit + push branche

## Future improvements
- Envisager d'extraire le noyau « longest-data / loop » dans un helper partagé
  testable si un 3e site TS (ex. gateway pré-calcul) réclame la même règle — pour
  l'instant, un seul consommateur web, duplication cross-language assumée avec le
  Swift (pas de runtime partagé).
- Backlog : `TrackingLinkService.generateUniqueToken` off-by-one (cf. analyse 182).
