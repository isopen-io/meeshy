# Plan — Itération 83w (Web)

**Analyse** : `docs/analyses/uiux/2026-11-10-iteration-83w.md`
**Base** : `origin/dev` · **Cible PR** : `dev` · **Branche** : `claude/practical-fermat-kt6x2g`

## Problème

`components/lens-preview-line.tsx:101` peignait le fini « rainbow » d'un aperçu de
liste avec un dégradé **codé en dur** (`#f43f5e, #f59e0b, #22c55e, #3b82f6,
#a855f7`) — une **jumelle divergente** du spectre de la maison `RAINBOW_SPECTRUM`
(`@/lib/effects-playback`), que la bulle (`effects-runner`) et iOS
(`houseSpectrum`) jouent déjà. Même message « rainbow » ⇒ trois arcs-en-ciel
différents. Et les 5 dernières hex de la plus grosse poche du gate d'harmonie.

## Correctif (SSoT, pas exemption)

1. **RED**
   - `scripts/check-design-harmony.test.ts` : describe « le fini arc-en-ciel d'un
     aperçu » — `scanSource(lens-preview-line.tsx)` === `[]`, source ⊇
     `RAINBOW_SPECTRUM`, ⊄ `#f43f5e`/`#a855f7`, pas d'exemption.
   - `src/components/lens-row-preview.test.tsx` : test de parité — le style du cas
     `effect-finish-rainbow` ⊇ chaque couleur de `RAINBOW_SPECTRUM`, ⊄ jumelle.
2. **GREEN** : importer `RAINBOW_SPECTRUM` de `@/lib/effects-playback` et composer
   `linear-gradient(90deg, ${RAINBOW_SPECTRUM.join(', ')})`.
3. Doc-comment enrichi (le spectre de la maison, partagé avec la bulle et iOS).

## Gates (preuve)

- `bun test scripts/check-design-harmony.test.ts` → 25/25 (23 → 25).
- `bun test src/components/lens-row-preview.test.tsx` → 131/131 (+1 parité).
- `bun test src/lib/effects-playback.test.ts src/components/lens-preview-entrance.test.tsx` → 10/10.
- `node scripts/check-design-harmony.mjs` → **14 → 9** (−5), 8 → 7 fichiers.
- `npx tsc --noEmit` → 0.

## Dimensions

Mûres : 6 (cohérence — un seul spectre pour un fini, liste = bulle = iOS),
11 (maintenabilité — jumelle supprimée, source unique gardée par témoins).
Non régressées : i18n, a11y, fluidité, performance, mémoire.

## Statut : ✅ CORRIGÉ — PR vers `dev`.
