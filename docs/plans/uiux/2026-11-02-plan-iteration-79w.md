# Plan d'itération 79w — i18n de la pastille « En pause » (visionneuse vidéo web)

**Date** : 2026-11-02 · **Périmètre** : `apps/web` (Vite + Preact) · **Base** : `origin/dev`
**Analyse appariée** : `docs/analyses/uiux/2026-11-02-iteration-79w.md`

## Problème

`components/viewer-video-page.tsx` affichait la pastille d'état « En pause » **en dur
en français**, visible à l'écran dans toutes les langues, alors que le bouton central
voisin du même composant servait déjà `translate(language, 'media.video.pause')`.

## Étapes (TDD, RED → GREEN)

1. **RED** — `components/viewer-video-paused-i18n.test.tsx` : rendre `<ViewerVideoPage>`
   en état plein cadre entré-en-pause, non actif, en EN puis FR ; attendre
   `« Paused »` (EN, sans « En pause ») / `« En pause »` (FR). ✅ échoue d'abord.
2. **GREEN — clé** : ajouter `media.video.paused` aux 7 catalogues
   (`catalog-{fr,en,es,pt,de,it,ar}.ts`), voisine de `media.video.pause`.
3. **GREEN — câblage** : la pastille rend `translate(language, 'media.video.paused')`
   + marqueur `data-viewer-paused-badge`.
4. **Gates** : `bun test` (témoin + i18n + media-viewer), `bun run type-check`,
   `check-design-harmony.mjs`.

## Critère de fin

- Témoin vert, parité 7 langues verte, type-check 0 erreur, harmonie inchangée (92/9).
- Plus aucun texte visible figé en français dans la visionneuse vidéo.

## Statut : ✅ LIVRÉ (iter-79w) — voir annotation de l'analyse appariée.
