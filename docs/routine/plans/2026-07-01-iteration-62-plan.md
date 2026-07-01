# Iteration 62 — Plan d'implémentation (2026-07-01)

## Objectif
Lot « Source unique — formatage de durée média (F29) » : converger les **6 réimplémentations** du
formateur `MM:SS`/`H:MM:SS` des lecteurs média sur `formatDuration` de `@/utils/audio-formatters`
(qui délègue au canonique `formatClock` de `@meeshy/shared`), sans régression visible et en corrigeant
deux bugs latents (`NaN`, durées ≥ 1 h).

## Pré-requis runner (parité CI)
- [x] `bun install` (jest web présent).
- [x] **Build du package shared** (`cd packages/shared && bun run build`) — indispensable ici : le
      checkout monorepo n'a pas de `dist/` prébuild, sans quoi les tests composants échouent au chargement
      (`@meeshy/shared/types/attachment` introuvable). CI le fait automatiquement.
- [x] Baseline : `VideoLightbox` + `VideoPlayer` + `SimpleAudioPlayer` + `audio-formatters` → 186 verts.

## Étapes (édition → vérification)

### Phase A — Convergence des 2 sites déjà nommés `formatDuration` (appels inchangés)
- [x] `components/v2/MediaVideoCard.tsx` : supprime la fn locale `formatDuration`, importe le canonique.
      (**gagne** la garde nulle `NaN → "0:00"` qui manquait.)
- [x] `components/audio/SimpleAudioPlayer.tsx` : supprime la fn locale `formatDuration`, importe le canonique.

### Phase B — Convergence des 4 sites `formatTime` (import + renommage des appels)
- [x] `components/v2/AudioPlayer.tsx` : supprime `formatTime`, importe `formatDuration`, 2 appels renommés.
- [x] `components/v2/MediaAudioCard.tsx` : idem, 2 appels renommés.
- [x] `components/video/VideoControls.tsx` : supprime le `const formatTime`, importe `formatDuration`, 2 appels.
- [x] `components/video/VideoLightbox.tsx` : supprime le `const formatTime`, importe `formatDuration`, 3 appels.

### Phase C — Tests & vérification
- [x] `audio-formatters.test.ts` : +2 cas (négatif → `0:00` ; roulement min→h `3661`/`5400`). **31/31**.
- [x] Aucune fonction locale `formatTime`/`formatDuration` résiduelle dans les 6 fichiers (grep vide).
- [x] `jest` audio/video/attachments : **25 suites / 640 tests** verts.
- [x] `tsc --noEmit` : **0 nouvelle erreur** (26 erreurs pré-existantes identiques baseline vs working).
- [ ] Commit + push `claude/sharp-wozniak-xto1f0` ; PR vers `main` ; CI verte ; **merge**.

## Hors périmètre (consigné dans l'analyse)
- F29b (formateurs durée ms-based, format « 1min »/« 1h23 »), F28c (`formatFileSize`), F30 (`escapeHtml`),
  F25b, F2, F10, F21.

## Continuité
Iter 63 : nouveau scout. Pistes prioritaires : **F29b** (formateurs durée ms-based → source unique
distincte), **F28c** (`formatFileSize` local/inline → canonique shared), **F30** (`escapeHtml` ×2).

## Incidents de merge (parallélisme multi-agents)
- Re-vérifier `origin/main` juste avant le merge. Le périmètre (6 lecteurs média + `audio-formatters.test`)
  est disjoint des tracks initiales/iOS/expiration → seul le slot de docs iter-62 pourrait collisionner
  → renuméroter si pris.

## Statut (mis à jour en fin d'itération)
- [x] Phase A / B — 6 convergences ; sémantique préservée < 1 h, 2 bugs latents corrigés (NaN, ≥ 1 h).
- [x] Phase C — tests + tsc verts ; reste : commit + push + PR + CI + merge.
