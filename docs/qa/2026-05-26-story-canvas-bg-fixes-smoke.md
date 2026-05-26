# Story Canvas Background Fixes — Smoke QA

**Date:** 2026-05-26
**Spec:** docs/superpowers/specs/2026-05-25-story-canvas-bg-stabilization-design.md
**PR:** fix/story-canvas-bg-stabilization-2026-05-26

## Préparation
- [ ] Installer le build via `./apps/ios/meeshy.sh run`
- [ ] Préparer 4 médias : vidéo paysage 16:9, vidéo portrait 9:16, image paysage, image carrée

## Bug 1 — Fit auto par orientation
- [ ] Vidéo paysage 16:9 → letterbox + fond story visible (composer)
- [ ] Vidéo paysage 16:9 → letterbox dans reader après publish
- [ ] Vidéo paysage 16:9 → letterbox dans MP4 exporté (partage)
- [ ] Vidéo portrait 9:16 → full bleed (comportement actuel préservé)
- [ ] Image paysage → letterbox composer + reader + export
- [ ] Image carrée 1:1 → letterbox (ratio < canvas)
- [ ] Double-tap → cycle visuel .auto → .fit → .fill → .auto
- [ ] Override "fit" persiste après save story + reload

## Bug 2 — Zéro flash noir
- [ ] Édition texte (10+ keystrokes) → 0 flash noir sur le bg
- [ ] Drag sticker + release → 0 flash noir
- [ ] Drag background + release → 0 flash noir
- [ ] Drag texte + release → 0 flash noir
- [ ] Pinch sur sticker → 0 flash noir
- [ ] Filtre actif + drag → filtre reste à jour (régression D3)
- [ ] Audio mixer + drag → audio reste fonctionnel (régression D3)

## Bug 3 — Drag bg live sur canvas
- [ ] Drag bg → mouvement visible LIVE sur canvas principal
- [ ] Drag bg → mouvement visible LIVE sur mini-preview (parité)
- [ ] Drag bg release → position commitée, pas de saut visuel
- [ ] Pinch zoom bg → behaviour préservé (cumule avec videoGravity)

## Migration douce (path α)
- [ ] Story existante avec mediaObject.x/y bg non-zéro → ignoré, prochaine édition nettoie

## Validation finale
- [ ] Aucune régression sur les autres features story (texte, stickers, audio, filtres, transitions)
