# Plan — Itération 76w (web)

> Jumeau de `docs/analyses/uiux/2026-10-25-iteration-76w.md`. Portée : `apps/web`
> uniquement. Base `origin/dev`, cible PR `dev`.

## Objectif

Deux littéraux que le gate d'harmonie (#8879) prend pour du chrome n'en sont pas —
un **code QR** (noir-sur-blanc, lu par une caméra) et une **luminance de masque
SVG** (blanc = visible, noir = masqué). Les « thématiser » les casserait. Les
marquer `harmony-exempt: <raison>` pour que le gate dise la vérité et que la routine
cesse de les ré-examiner.

## Étapes (TDD)

1. **RED** — témoin `components/game/harmony-nonpaint-literals.test.ts` : `scanSource()`
   du gate sur `referral-qr.ts` et `author-plate.tsx` doit rendre `[]`. Échoue :
   2 + 2 violations.
2. **GREEN** — poser les marqueurs :
   - `lib/game-photo/referral-qr.ts:24` → `// harmony-exempt: …` (exempte 24 + 25).
   - `components/game/author-plate.tsx` → `{/* harmony-exempt: … */}` en fin de ligne
     du `<rect>` (exempte `<rect fill="white">` + `<path stroke="black">`).
3. **Ancrage** — `author-plate.test.tsx` : asserter que le grattage rend un `<mask>`
   avec `<rect fill="white">` et `<path stroke="black">` (la luminance que l'exemption
   justifie). La valeur canonique du QR est déjà épinglée par
   `game-photo-frame.test.tsx:170-171` → non dupliquée.

## Gates

- `bun test` sur les 5 suites QR/plaque + le témoin neuf → 112/112.
- `node scripts/check-design-harmony.mjs` → 96 → 92 ; les deux fichiers sortent du
  rapport.
- `bun run type-check` → 0 erreur.

## Hors périmètre (→ pistes 77w+)

- `admin-post-preview.tsx` letterbox `#000`, `mood-page.tsx` fond immersif : même
  famille « pas du chrome », mais cas « surface média » à motiver au cas par cas.
- `profile-sections.tsx` `DECOR_ACCENT` : jumelle du jeton `--ios-indigo-500` (vraie
  dette de chrome, à ramener au jeton — pas un bug visible).

## Statut : livré — voir l'annotation `✅ CORRIGÉ (iter-76w)` de l'analyse.
