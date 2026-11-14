# Plan — itération 87w (web)

**Analyse** : `docs/analyses/uiux/2026-11-14-iteration-87w.md`
**Axe** : cohérence de thème (6) + maintenabilité (11), gate d'harmonie #8879.
**Branche** : `claude/practical-fermat-vayul2` → PR vers `dev`.

## Problème

Deux pastilles d'action de l'en-tête d'un fil peignent le glyphe de leur état
**actif** en littéral `'#fff'`, chacune sur un **aplat saturé** :
`thread-header-bring.tsx:80` (cloche qui sonne, fond `var(--color-error)`) et
`thread-header-talkie.tsx:129` (talkie pressé, fond `linear-gradient(135deg,
var(--accent), …)`). 2 des 8 violations du gate. La charte nomme déjà cette encre
(blanc sur aplat marque/accent/erreur → `var(--color-ios-on-brand)`, ligne 40).

## Correction (TDD)

1. **RED** : describe « la pastille d'action d'en-tête » dans
   `check-design-harmony.test.ts` — `scanSource(bring) → []`,
   `scanSource(talkie) → []`, les deux ⊇ `var(--color-ios-on-brand)`, ⊄ `'#fff'`.
2. **GREEN** : l'encre active des deux pastilles `'#fff'` →
   `'var(--color-ios-on-brand)'`. Une ligne par fichier. Fonds d'aplat déjà
   jetonnés (`var(--color-error)` / `var(--accent)`), non touchés.

## Preuve

- `check-design-harmony.test.ts` : 36 → **38** GREEN.
- Gate `check-design-harmony.mjs` : **8 → 6** violations (−2), **7 → 5** fichiers.
- `thread-header-bring` / `thread-header-talkie` / `thread-header-talkie-band` /
  `talkie-host` : **28/28** GREEN (non-régression).
- `tsc --noEmit` : 0.

## Critère de fin

PR verte fusionnée dans `dev` ; analyse annotée `✅ CORRIGÉ (iter-87w)` ; pointeur
`web-iteration-pointer.md` mis à jour ; prochaine itération **88w** (pistes en pied
d'analyse : `message-menu` masque de luminance, `comment-compose-bar` `text-white`,
`admin-post-preview` `#000`, etc.).

## ✅ Statut : LIVRÉ (iter-87w)
