# Plan — Itération 82w (Web)

**Analyse appariée** : `docs/analyses/uiux/2026-11-09-iteration-82w.md`
**Base** : `origin/dev` · **Cible PR** : `dev` · **Branche** : `claude/practical-fermat-jsk76s`

## Objectif

Tokeniser le chrome immersif de `components/mood-page.tsx` (l'écran d'une humeur
reçue) vers les jetons de la charte visuelle web — la plus grosse poche de couleurs
en dur du produit web (13 des 27 violations du gate d'harmonie). Dimensions visées :
6 (cohérence de positionnement), 11 (maintenabilité).

## Étapes (TDD)

1. **Mesure d'ouverture** : `node scripts/check-design-harmony.mjs` → 27/9.
   `mood-page.tsx` = 13.
2. **RED** : `scripts/check-design-harmony.test.ts`, describe « l'écran d'humeur » —
   `scanSource(mood-page.tsx)` → `[]` (échoue : 13), jetons présents, pas d'exemption.
3. **GREEN** : remplacer les 13 littéraux par leur jeton (table motif → jeton de
   l'analyse) :
   - `text-white` → `text-on-media` (×3) / `text-ios-on-brand` (bouton de marque, ×1)
   - `color-mix(…, black)` → `color-mix(…, var(--color-media-backdrop))`
   - `rgb(0 0 0 / …)` voiles/ombres → `var(--color-scrim-soft)` / `var(--color-scrim)`
   - `rgb(255 255 255 / .85)` halo → `var(--color-on-media-2)`
   - `'white'` liseré focus → `var(--color-on-media)`
4. **Préserver le témoin d'effet** : marqueur `data-mood-backdrop-fill` sur le fond
   de repli ; `mood-page.test.tsx` atteste la branche (happy-dom ne parse pas
   `color-mix(…, var(…))`).
5. **Gates** : `bun test` (gate + mood-page), `tsc --noEmit`, gate harmonie 27 → 14.
6. **PR vers `dev`** (auto-merge au vert). Annoter l'analyse `✅ CORRIGÉ (82w)`,
   mettre à jour `web-iteration-pointer.md` (81w ✅, 82w, prochaine 83w).

## Critère de fin

- Gate d'harmonie : `mood-page.tsx` = 0 violation ; total 27 → 14.
- `scripts/check-design-harmony.test.ts` 23/23, `mood-page.test.tsx` 8/8, `tsc` 0.
- Aucune régression visuelle (±5 % d'alpha, bande canonique de la charte).
- PR mergée dans `dev` ; branche supprimée.
