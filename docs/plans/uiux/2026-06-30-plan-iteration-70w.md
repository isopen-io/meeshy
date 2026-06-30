# Plan — Itération 70w (Web)

> **Scope** : `apps/web` exclusivement. Base : `main` HEAD (e05034c, post-#1085/68i ; 69w/#1084 mergé). Branche : `claude/practical-fermat-v15k29`.

## Objectif
Rendre opérables au clavier (Enter/Space), focusables et correctement exposés au lecteur d'écran les **lignes de résultats de recherche du modal d'invitation** (`invite-user-modal.tsx`), aujourd'hui souris-only — **et** corriger le bug d'interaction associé : le bouton « Ajouter » visible n'a aucun `onClick` (mort + double arrêt de tabulation). Candidat nommé du « différé prioritaire 70w+ » du pointeur autoritaire 69w.

## Étapes
1. **Audit ciblé** du candidat 69w `invite-user-modal.tsx` → confirme (a) lignes `<div onClick>` souris-only et (b) bouton « Ajouter » sans handler. ✅
2. **Ligne de résultat** → `role="button"` + `tabIndex={isSelected ? -1 : 0}` + `aria-label` + `aria-disabled` + `onKeyDown` Enter/Space (no-op si déjà sélectionné) + `focus-visible:ring`. Mémoïse `displayName`/`isSelected` (supprime la duplication d'expression). ✅
3. **Bouton « Ajouter » interne** → présentationnel : `tabIndex={-1}` + `aria-hidden="true"` (conserve l'affichage + `disabled`). ✅
4. **Tests** : 2 cas neufs (Enter/Space) dans la suite existante + non-régression. ✅
5. **CI vert** → merge `main` via PR → supprimer branche → MAJ branch-tracking. ⏳

## Contraintes
- 0 nouvelle clé i18n (`inviteModal.add` existant = préfixe du nom accessible).
- Pattern clavier identique à 67w/68w/69w (inline `onKeyDown`, pas de hook partagé — aucun n'existe).
- Token `focus-visible:ring-ring` (standard shadcn, déjà utilisé `ui/button`, `SelectableSquare` 69w).
- Aucune modification de comportement souris (clic préservé, testé par les 25 cas existants).
- Le test existant localise la ligne via `closest('[class*="cursor-pointer"]')` → `cursor-pointer` conservé sur la ligne.

## Critères d'acceptation
- [x] Lignes de résultats activables clavier (Enter/Space) + focus visible + `role`/`aria`.
- [x] Bouton « Ajouter » neutralisé (plus de bouton mort ni de double tab stop).
- [x] jest ciblé 27/27 (25 pré-existants + 2 neufs).
- [ ] CI verte sur la PR, merge `main`, branche supprimée.

## ✅ PLAN EXÉCUTÉ (70w — 2026-06-30)
Code/tests/docs faits, jest local 27/27. Reste : merge `main` après CI verte. Suite (71w+) : audit a11y clavier restant (admin agent Badges `AgentGlobalConfigTab`, `AudioEffectsTimeline` seek, `details-sidebar`) — cf. analyse 70w § différé.
