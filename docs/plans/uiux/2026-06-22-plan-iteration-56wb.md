# Plan de correction — Itération 56wb (web only)

**Date** : 2026-06-22
**Branche** : `claude/practical-fermat-ix2d8b`
**Base** : `main` HEAD `e1960c0` (post-merge #667/#661)
**Analyse liée** : `docs/analyses/uiux/2026-06-22-iteration-56wb.md`

## Objectif
Consolider le rouge d'erreur codé en dur `#C1292E` (6 composants v2, non
dark-mode-aware) vers le token sémantique `var(--gp-error)` (source de vérité
dark-mode-aware). Cohérence design-system + correction dark mode.

## Tâches
- [x] Auditer toutes les occurrences `#C1292E` (`grep` → 6 fichiers v2)
- [x] Confirmer `--gp-error` défini en `:root` (#EF4444) + `.dark` (#F87171)
- [x] Confirmer `var(--gp-error)` = source de vérité (Toast/PostCard/SwipeableRow/
      MessageComposer/ConversationSidebar)
- [x] Confirmer pattern `var()`+opacité déjà éprouvé (sibling `var(--gp-deep-teal)/20`
      dans Input/Textarea, `var(--gp-deep-teal)/10` dans Badge) → zéro nouvelle syntaxe
- [x] `Button.tsx:53` → `bg/ring-[var(--gp-error)]`
- [x] `Input.tsx:29` → `border/focus:border/focus:ring-[var(--gp-error)]/20`
- [x] `Textarea.tsx:21` → idem Input
- [x] `Badge.tsx:32` → `bg-[var(--gp-error)]/10 text-[var(--gp-error)]`
- [x] `Label.tsx:23` → `text-[var(--gp-error)]`
- [x] `StatusComposer.tsx:128` → `text-[var(--gp-error)]`
- [x] Vérifier `grep C1292E` = 0 restant
- [ ] Commit + push sur la branche
- [ ] PR → main, CI vert, merge
- [ ] Mettre à jour `branch-tracking.md` (next base post-56wb)

## Garanties
- Diff 1:1 (6 fichiers, 6 lignes), aucune logique modifiée.
- Aucun fichier locale / chaîne i18n touché → orthogonal aux 56w parallèles
  (#770/#771).
- Pas de risque Tailwind : chaque classe produite a un homologue frère déjà shippé
  dans le même fichier.

## Validation
- `node_modules` absent du sandbox routine → build Tailwind local impossible ;
  la sécurité repose sur l'homologie stricte avec les patterns frères en place
  (mêmes utilitaires `border-`/`bg-`/`text-`/`ring-` arbitraires + modificateur
  d'opacité sur `var()`), déjà validés en production. CI (node_modules réels)
  reste le filet de sécurité avant merge.

## Suite (57w+)
- Arbitrage `theme.colors.*` vs `gp-*` pour success/warning/gold de `Badge`.
- Gestes/a11y modales hand-rolled : `AgentTopicEditModal` (Escape + backdrop +
  aria-label close), `ConversationDrawer` (Escape + role=dialog/aria-modal).
