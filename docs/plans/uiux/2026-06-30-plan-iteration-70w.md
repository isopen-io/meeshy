# Plan — Itération 70w (Web)

> **Scope** : `apps/web` exclusivement. Base : `main` HEAD (a89618a, post-#1077 ; 68w/#1082 inclus). Branche : `claude/practical-fermat-d18nnl`.

## Objectif
Rendre opérables au clavier (Enter/Espace), focusables et correctement exposés au lecteur d'écran les **résultats de recherche du modal d'invitation** (`InviteUserModal`), aujourd'hui souris-only — et corriger le **bug latent** du bouton « Ajouter » sans `onClick` (inerte au clavier). Catégorie « différé prioritaire 70w+ » du pointeur autoritaire.

## Étapes
1. **Audit ciblé** `apps/web` (hors clusters 67w/68w/69w-en-vol) → `invite-user-modal.tsx` retenu (nommé au § différé 69w, doublement défectueux). ✅
2. **invite-user-modal.tsx** : ligne de résultat `<div onClick>` → **`<button type="button">`** natif + `aria-label` (`{add|selected} {nom}`) + `focus-visible` ; clic souris conservé. ✅
3. **invite-user-modal.tsx** : `<Button>` « Ajouter » inerte (sans `onClick`) → **pastille `<span aria-hidden>`** décorative (un seul contrôle interactif par ligne). ✅
4. **Tests** : +2 cas a11y clavier dans la suite existante + non-régression des 25 cas. ✅
5. **CI vert** → merge `main` via PR → supprimer branche → MAJ branch-tracking. ⏳

## Contraintes
- 0 nouvelle clé i18n (`inviteModal.add` / `inviteModal.selected` existent ×4 locales).
- Pattern clavier conforme 67w/68w/69w mais **via `<button>` natif** (préférable à `role="button"` + `onKeyDown` quand l'élément peut être un vrai bouton — aucun contenu interactif imbriqué).
- Token `focus-visible:ring-ring` (standard shadcn).
- Aucune modification du comportement souris (clic de ligne préservé, `cursor-pointer` conservé pour la compat des tests existants).

## Critères d'acceptation
- [x] Lignes de résultat = `<button>` natif activable clavier + nom accessible.
- [x] Bouton « Ajouter » inerte supprimé (action unique sur la ligne).
- [x] jest `invite-user-modal` 27/27 (25 existants + 2 nouveaux).
- [ ] CI verte sur la PR, merge `main`, branche supprimée.

## ✅ PLAN EXÉCUTÉ (70w — 2026-06-30)
Code/tests/docs faits. Reste : merge `main` après CI verte. Suite (71w+) : audit a11y clavier restant (admin agent Badges, AudioEffectsTimeline seek, details-sidebar édition au clic) — cf. analyse 70w § différé. ⚠️ Ne pas toucher `create-link-modal/*` (69w/#1084).
