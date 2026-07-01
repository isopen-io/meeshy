# Iteration 55 — Plan d'implémentation (2026-07-01)

## Objectif
Lot « Source unique des initiales — F26c-d » : remplacer les deux dérivations d'initiale manuelles
`getUserDisplayName(user).charAt(0).toUpperCase()` de `MemberSelectionStep` par le canonique
`getUserInitials` de `@/lib/avatar-utils` (dernière réimplémentation d'initiale d'identité dans
`apps/web`).

## Pré-requis runner (parité CI)
- [x] `bun install` (jest web présent).
- [x] Baseline : `create-conversation-modal.test.tsx` (rend `MemberSelectionStep`) **26/26** vert.
- [x] Aucun test n'assert l'initiale mono-lettre (`AvatarFallback` mocké passthrough).

## Étapes (délégation → vérification)

### Phase A — Converger MemberSelectionStep
- [x] Ajouter `import { getUserInitials } from '@/lib/avatar-utils';`.
- [x] l.119 (liste candidats) : `AvatarFallback` → `{getUserInitials(user)}`.
- [x] l.183 (badge sélectionné) : `AvatarFallback` → `{getUserInitials(user)}`.
- [x] Conserver la fonction locale `getUserDisplayName` (libellés + `aria-label`).

### Phase B — Vérification & livraison
- [x] `jest create-conversation-modal.test.tsx` → **26/26** vert.
- [x] `tsc --noEmit` web : aucune erreur sur `MemberSelectionStep` / `avatar-utils`.
- [ ] Commit + push `claude/sharp-wozniak-k04xk9` ; PR vers `main` ; CI verte ; **merge squash**.

## Hors périmètre (consigné dans l'analyse)
- F26c-c (widgets dashboard décoratifs), F25b, F2, F10, F21.

## Continuité
Iter 56 : nouveau scout hors cluster nom/initiales (clos). Pistes : F26c-c (widgets dashboard
preview + `Avatar` mono-lettre — intention décorative à trancher), ou nouveau domaine (slug/url,
sanitize, date-relative, validateurs téléphone F25b).

## Incidents de merge (parallélisme multi-agents)
- Un agent parallèle a produit une iter 54 identique (PR #1164 fermée comme doublon). Avant de
  committer, re-vérifier `origin/main` ; si `MemberSelectionStep` a déjà été convergé par un commit
  parallèle, fermer cette itération comme doublon et passer au scout suivant.

## Statut (mis à jour en fin d'itération)
- [x] Phase A — 2 `AvatarFallback` de `MemberSelectionStep` délèguent à `getUserInitials` ; import
      ajouté ; `getUserDisplayName` local conservé pour libellés/aria.
- [x] Phase B — `create-conversation-modal.test.tsx` **26/26** ; `tsc` web sans erreur sur les
      fichiers touchés ; commit + push + PR + CI + merge.
