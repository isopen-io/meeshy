# Plan — itération 90w (web)

**Analyse** : `docs/analyses/uiux/2026-11-20-iteration-90w.md`
**Axe** : maintenabilité (11) + cohérence de thème (6), gate d'harmonie #8879.
**Branche** : `claude/practical-fermat-awbeqk` → PR vers `dev`.

## Problème

Quatre styles inline écrivent `var(--jeton, littéral)` et le gate y voit le
littéral comme du chrome en dur (4 des 9 violations à l'ouverture) :

- `components/battery-panel.tsx:312` — `color: 'var(--color-ios-on-brand, #fff)'`
  (bouton « confirmer » sur aplat de marque) ;
- `components/shared-location-card.tsx:34` — `color: 'var(--color-on-brand, #fff)'`
  (lien « ouvrir dans Plans » sur aplat de marque) ;
- `components/profile-relation-face.tsx:112` — `backgroundColor: 'var(--color-ios-fill, rgba(127,127,127,.14))'` ;
- `components/vitrine-preview.tsx:71` — même repli `--color-ios-fill`.

Les trois jetons sont **déclarés sans condition** (`@theme inline` → `:root`) :
`--color-ios-on-brand` / `--color-ios-fill` (`styles/ios.css:56,63`),
`--color-on-brand` (`styles/app.css:59`) ; garde `styles/declared-tokens.test.ts`.
Le littéral n'est donc **jamais rendu**. Mais on le **garde** : pour les deux
boutons de marque, une encre absente sur aplat saturé rendrait le texte illisible
— c'est du contraste défensif, pas du chrome en dur.

Gate **remesuré à l'ouverture : 9/8** (stable depuis 89w, `dev` sans poche neuve).

## Correction (TDD)

1. **RED** : describe « les replis d'un jeton de charte défini — un filet de
   contraste, jamais rendu » dans `check-design-harmony.test.ts` —
   `scanSource(x) → []` pour les 4 fichiers, `exemptionOf(path) === null`
   (exemption **à la ligne**), et le repli **conservé** (`toContain('var(--…, …)')`).
   2 tests RED (42 pass → 2 fail).
2. **GREEN** : commentaire inline `/* harmony-exempt: repli d'un jeton de charte
   défini (--color-…), jamais rendu … */` dans l'objet `style`, sur chacune des 4
   lignes. **Aucun pixel ne change** (commentaires seuls).

Décision repli vs retrait : **exemption**, pas retrait — le repli protège le
contraste si le jeton manquait au montage ; le retirer échangerait un faux positif
du gate contre un vrai risque de lisibilité. Même régime que `face-rig` (89w) et le
masque de luminance appel (85w).

## Preuve

- `check-design-harmony.test.ts` : 42 → **44** GREEN, 0 fail (162 assertions).
- Gate `check-design-harmony.mjs` : **9 → 5** violations (−4, exactement la
  famille des replis), **8 → 4** fichiers.
- Tests des 4 composants + voisins : **59/59** (non-régression, styles inchangés).
- `tsc --noEmit` : 0.

## Critère de fin

PR verte fusionnée dans `dev` ; analyse annotée `✅ CORRIGÉ (iter-90w)` ; pointeur
`web-iteration-pointer.md` mis à jour ; prochaine itération **91w** (pistes en pied
d'analyse : `message-menu` masque de luminance `, black` ×2 — le plus net ;
`conversation-backdrop` voile dynamique ; `rank-blason` hsl prisme ;
`admin-post-preview` `#000` letterbox ; + axe épuration toujours non entamé).

## ✅ Statut : LIVRÉ (iter-90w)
