# Plan — Itération 85w (Web)

**Analyse appariée** : `docs/analyses/uiux/2026-11-12-iteration-85w.md`
**Base** : `origin/dev` · **Cible PR** : `dev` (auto-merge au vert, #9226)
**Dimensions visées** : 6 (cohérence de thème) · 11 (maintenabilité)

## Problème

Famille **appel** : le même fondu de bord
(`linear-gradient(…, #000 8px, #000 calc(100% - 8px), transparent)`, masque de
LUMINANCE) écrit en **trois jumelles divergentes** — `RAIL_FADE`
(`call-control-actions.tsx`), `ROW_EDGE_FADE` (`call-row-keys.ts`), `fade` de
`stripBox` (`call-grid.tsx`) — soit 6 des 17 violations du gate d'harmonie. Plus
le verre de `call-floating-pill.tsx` en `color-mix(in srgb, white 22%, transparent)`
(filet blanc que la charte nomme `media-hairline`).

## Correctif

1. **Source unique** `edgeFadeMask(axis: 'to right' | 'to bottom')` dans
   `lib/calls/call-row-keys.ts`, exemptée UNE fois (`harmony-exempt:` luminance).
2. `ROW_EDGE_FADE` dérive (`to right`) ; `RAIL_FADE` consomme (`to bottom`) ;
   `stripBox` appelle avec l'axe du bandeau. Sortie **byte-identique**.
3. `call-floating-pill.tsx` verre → `var(--color-media-hairline)` (parité talkie 84w).

## TDD / Gates

- RED → GREEN : `scripts/check-design-harmony.test.ts` describe « la famille appel »
  (33/33).
- `check-design-harmony.mjs` : **17 → 10** (−7), **12 → 8 fichiers**.
- `call-rails/bubble/row-keys` : 31/31 (masque exact du rail inchangé).
- `tsc --noEmit` : 0.

## Statut

✅ **LIVRÉ (85w)** — PR vers `dev`. Fichiers : `call-row-keys.ts`,
`call-control-actions.tsx`, `call-grid.tsx`, `call-floating-pill.tsx`,
`check-design-harmony.test.ts` (+ analyse/plan).
