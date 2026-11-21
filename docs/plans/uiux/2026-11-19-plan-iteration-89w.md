# Plan — itération 89w (web)

**Analyse** : `docs/analyses/uiux/2026-11-19-iteration-89w.md`
**Axe** : maintenabilité (11) + cohérence de thème (6), gate d'harmonie #8879.
**Branche** : `claude/practical-fermat-6cktea` → PR vers `dev`.

## Problème

`paintMask` (`lib/calls/face-rig.ts:65-67`, #19779 — gréement de visage qui
agrandit les yeux du bébé dans les effets d'appel) peint un dégradé radial
`rgba(0,0,0,1) → rgba(0,0,0,1) → rgba(0,0,0,0)` sur un canvas **hors DOM**. Le
gate y voit **3 `rgba(`** (3 des 12 violations à l'ouverture), mais ce n'est
**pas une couleur** : le canvas sert UNIQUEMENT de **masque alpha**, composé en
`globalCompositeOperation = 'destination-in'` (ligne 112) où seule l'ALPHA
découpe l'œil — le noir n'est jamais rendu comme teinte. La charte ne nomme aucun
jeton pour une rampe d'alpha de compositing (même cas que le masque de luminance
85w et l'onde canvas 84w).

Gate **remesuré à l'ouverture : 12/9** (remonté de 5/4 — `dev` a reçu des poches
neuves).

## Correction (TDD)

1. **RED** : describe « le masque de l'œil (face-rig) — un alpha, pas une
   couleur » dans `check-design-harmony.test.ts` — `scanSource(faceRig) → []`,
   `exemptionOf('lib/calls/face-rig.ts') === null` (exemption **à la ligne**, pas
   par chemin). 2 tests RED.
2. **GREEN** : commentaire d'en-tête expliquant le masque alpha + marqueur
   `// harmony-exempt: alpha de masque (destination-in), pas une couleur` sur les
   3 lignes `addColorStop`. **Aucun pixel ne change** (commentaires seuls).

Pas un jeton (aucun n'existe pour ce rôle), pas un chemin exempté (le fichier
reste scanné) : exemption motivée à la ligne.

## Preuve

- `check-design-harmony.test.ts` : 40 → **42** GREEN, 0 fail.
- Gate `check-design-harmony.mjs` : **12 → 9** violations (−3, exactement
  `face-rig`), **9 → 8** fichiers.
- `face-rig.test.ts` (comportement du gréement) : **10/10** (non-régression).
- `tsc --noEmit` : 0.

## Critère de fin

PR verte fusionnée dans `dev` ; analyse annotée `✅ CORRIGÉ (iter-89w)` ; pointeur
`web-iteration-pointer.md` mis à jour ; prochaine itération **90w** (pistes en pied
d'analyse : la **famille des replis `var(--token, littéral)`** — 4 fichiers,
`battery-panel`/`shared-location-card`/`profile-relation-face`/`vitrine-preview`,
candidate d'itération groupée après vérif que les jetons sont définis sur `:root` ;
puis `message-menu` masque de luminance, `conversation-backdrop` voile dynamique,
`rank-blason` hsl prisme, `admin-post-preview` `#000` letterbox ; + axe épuration
toujours non entamé).

## ✅ Statut : LIVRÉ (iter-89w)
