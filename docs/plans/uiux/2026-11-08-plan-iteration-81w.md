# Plan — Itération 81w (Web)

**Analyse appariée** : `docs/analyses/uiux/2026-11-08-iteration-81w.md`
**Base** : `origin/dev` → PR vers `dev` (doctrine `web-iteration-pointer.md`)
**Branche de travail** : `claude/practical-fermat-9e6ean`

## Objectif

Corriger le PÉRIMÈTRE du gate d'harmonie web (`scripts/check-design-harmony.mjs`,
#8879) : l'art GÉNÉRÉ `components/screen-wait-art.ts` (SVG baké du sticker Mee/Meo
« On danse », byte-identique à sa source `lib/mee/screen-wait-art-source` DÉJÀ
exemptée) était compté comme du chrome — 70 des 92 violations, 76 % du rouge, tous
des faux positifs noyant les 22 vraies cibles.

## Étapes (RED → GREEN)

1. **RED** — ajouter à `scripts/check-design-harmony.test.ts` le describe « l'art
   d'attente baké » : `exemptionOf('components/screen-wait-art.ts')` doit être ≠ null
   (et la source `lib/mee/…` l'est déjà) ; garde que l'exemption ne déborde ni sur
   `components/screen-wait.tsx` (chrome) ni sur le témoin.
2. **GREEN** — nouvelle entrée `EXEMPT_PATHS` (préfixe serré `components/screen-wait-art`,
   raison motivée) posée à côté de l'entrée `lib/mee/` dont elle est le prolongement.
3. **Mesure** — `node scripts/check-design-harmony.mjs` : 92/9 → 22/8.
4. **Non-régression** — `screen-wait.test.tsx`, `decor-accent-single-source.test.ts`,
   `game/harmony-nonpaint-literals.test.ts` verts.

## Résultat

- Gate : **92 → 22 violations**, **9 → 8 fichiers** (−70, l'art baké exactement).
- Témoins : `check-design-harmony.test.ts` **21/21** (+1 describe) ; voisins **32/32**.
- Aucun rendu, texte ni comportement touché : seul le périmètre d'un outil de qualité
  est corrigé. Le fichier d'art n'est pas modifié.

## Statut : ✅ LIVRÉ — PR vers `dev` (voir `web-iteration-pointer.md`).
