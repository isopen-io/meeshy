# Plan — itération 88w (web)

**Analyse** : `docs/analyses/uiux/2026-11-15-iteration-88w.md`
**Axe** : cohérence de thème (6) + maintenabilité (11), gate d'harmonie #8879.
**Branche** : `claude/practical-fermat-dqytex` → PR vers `dev`.

## Problème

La barre de composition d'un commentaire d'export (`routes/comment-compose-bar.tsx:100`)
peint le ▶ (indicateur vidéo) **posé SUR la vignette vidéo** (`<img object-cover>`)
en littéral `text-white`. 1 des 6 violations du gate. La charte nomme déjà cette
encre : un glyphe blanc **sur un média** est `text-on-media` (= `--color-on-media`
= `--ios-on-media` = `#ffffff`, byte-identique, constant clair/sombre) — le même
jeton que le voisin `components/comment-media.tsx:92` sur le même motif.

## Correction (TDD)

1. **RED** : describe « le ▶ d'une vignette vidéo » dans
   `check-design-harmony.test.ts` — `scanSource(bar) → []`, la barre non exemptée,
   le fichier ⊇ `text-on-media`, ⊄ `text-white`.
2. **GREEN** : l'encre du ▶ `text-white` → `text-on-media`. Une ligne.
   `drop-shadow` conservé (lisibilité sur vignette claire).

## Preuve

- `check-design-harmony.test.ts` : 38 → **40** GREEN.
- Gate `check-design-harmony.mjs` : **6 → 5** violations (−1), **5 → 4** fichiers.
- `comment-media.test.tsx` (voisin, même motif) : **6/6** GREEN (non-régression).
- `tsc --noEmit` : 0.

## Critère de fin

PR verte fusionnée dans `dev` ; analyse annotée `✅ CORRIGÉ (iter-88w)` ; pointeur
`web-iteration-pointer.md` mis à jour ; prochaine itération **89w** (pistes en pied
d'analyse : `message-menu` masque de luminance, `conversation-backdrop` voile
dynamique, `rank-blason` hsl prisme dynamique, `admin-post-preview` `#000` letterbox
— désormais surtout des **exemptions motivées** à qualifier, plus des jetons).

## ✅ Statut : LIVRÉ (iter-88w)
