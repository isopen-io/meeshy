# Plan — Itération 75w (UI/UX web)

**Analyse** : `docs/analyses/uiux/2026-10-24-iteration-75w.md`
**Base** : `origin/dev` · **Cible PR** : `dev` · **Suffixe** : `w` (web)

## Objectif
La vignette « Signature » du sélecteur d'apparence doit être un **aperçu fidèle**
du fond réel du fil, en mode clair ET sombre, sans couleur en dur ni dégradé
jumeau.

## Étapes (TDD)
1. **RED** — `appearance-picker-sections.test.tsx` : la vignette Signature porte
   `[data-appearance-signature-thumb]`, est alimentée par les variables
   canoniques `--backdrop-dark-start/-end` (= `BACKDROP_DARK_*`) et `--accent`,
   sans dégradé inline. (échoue : l'ancienne vignette est un `<span>` à style
   inline codé en dur.)
2. **GREEN** —
   - `styles/appearance-picker.css` : `.appearance-signature-thumb` réplique la
     couche de base de `.thread-backdrop` (135°, 3 arrêts, teinte 12 %), +
     `:root.light` ; texte `var(--color-ios-ink)`.
   - `appearance-picker-sections.tsx` : la vignette applique la classe + le
     marqueur, et `style={withAccent(accent, { width, height, ...backdropStyleVars() })}`.
     Import de la feuille.
3. **REFACTOR / gates** — harmonie verte sur le fichier, `type-check`, suites
   d'apparence vertes.

## Fichiers touchés
- `apps/web/src/components/appearance-picker-sections.tsx`
- `apps/web/src/components/appearance-picker-sections.test.tsx`
- `apps/web/src/styles/appearance-picker.css` (neuf)
- `docs/analyses/uiux/2026-10-24-iteration-75w.md`, ce plan, pointeur, 9 annotations legacy.

## Fin
`Closes` aucune issue dédiée (dette #8879, un cas) ; preuve = témoin + gate
harmonie + type-check. PR vers `dev`, auto-merge au vert, branche supprimée.

## ✅ Statut : LIVRÉ (voir PR dans le pointeur web)
