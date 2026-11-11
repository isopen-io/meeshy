# Plan — Itération 84w (Web)

**Date** : 2026-11-11 · **Base** : `origin/dev` · **Cible PR** : `dev` (auto-merge au vert)
**Analyse** : `docs/analyses/uiux/2026-11-11-iteration-84w.md`

## Problème

Le talkie élargi sur la barre d'en-tête (`apps/web/src/components/talkie-header-band.tsx`,
transposition de `TalkieHeaderLiveBar.swift`, #17338) peignait son chrome en
**15 littéraux de couleur bruts** (blanc/noir rgba + `#fff`/`#000`) — la plus
grosse poche du gate d'harmonie (15/28 à l'ouverture) — et son rouge
d'enregistrement en `var(--color-error)`, jumelle divergente d'iOS
(`errorStrong`) qui tombe à un rouge illisible sur fond sombre en thème clair.

## Correctif (TDD, périmètre `apps/web` exclusif)

1. **RED** — `scripts/check-design-harmony.test.ts` : describe « la barre de talkie
   élargie » (4 tests sur la vraie source : `scanSource` → `[]`, jetons présents,
   `ios-error-strong` oui / `color-error` non, `harmony-exempt:` présent).
2. **GREEN** — `src/components/talkie-header-band.tsx` :
   - les 13 littéraux DOM → jetons `on-media` / `on-media-2` / `media-fill` /
     `media-hairline` / `scrim-soft`, ou `color-mix(in srgb, var(--color-on-media) N%, transparent)`
     pour les alphas sans dosage canonique (35/28/40/45/80 %) ;
   - `RECORDING_RED` → `var(--ios-error-strong)` (parité iOS + contraste) ;
   - onde canvas (`drawBars`) et masque de luminance marqués `harmony-exempt:` motivés.
3. **Témoin de rendu** — `src/components/thread-header-talkie.test.tsx` : l'assertion
   du voile hors ligne passe de `rgba(0, 0, 0, 0.38)` à `var(--color-scrim-soft)`.

## Gates attendus

- `check-design-harmony.test.ts` : 25 → **29** GREEN.
- `thread-header-talkie{,-band}.test.tsx` : **15** GREEN.
- `check-design-harmony.mjs` : **28 → 13** violations (−15), 11 → 10 fichiers.
- `tsc --noEmit` : 0.

## Branche / merge

- Branche de travail : `claude/practical-fermat-y94b4f` (reset sur `origin/dev`).
- PR vers `dev` ; auto-merge au vert ; branche supprimée après merge.
- Pointeur `web-iteration-pointer.md` : 83w ✅, 84w ⏳→✅, prochaine = 85w.

## ✅ Statut : LIVRÉ (voir annotation de l'analyse 84w)
