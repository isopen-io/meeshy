# Iteration 56 — Plan d'implémentation (2026-07-01)

## Objectif
Lot « Source unique des initiales — admin/users — F26c-c(a) » : remplacer les deux dérivations
d'initiale manuelles `user.displayName?.charAt(0) || user.username.charAt(0).toUpperCase()` de
`app/admin/users/page.tsx` (tableau desktop + carte mobile) par le canonique `getUserInitials`
(`@/lib/avatar-utils`). Corrige aussi un bug de casse (`displayName?.charAt(0)` non majusculé).

## Pré-requis runner (parité CI)
- [x] `bun install` (jest web présent).
- [x] Aucun test sur la page liste `app/admin/users/page.tsx` (seul `[id]/page.test.tsx` = détail).
- [x] 2 erreurs TS `.data` (l.66-67) confirmées **pré-existantes** sur `main` (hors périmètre).

## Étapes (délégation → vérification)

### Phase A — Converger admin/users
- [x] Ajouter `import { getUserInitials } from '@/lib/avatar-utils';`.
- [x] l.351 (ligne desktop) : cercle avatar → `{getUserInitials(user)}`.
- [x] l.401 (carte mobile) : cercle avatar → `{getUserInitials(user)}`.

### Phase B — Vérification & livraison
- [x] `tsc --noEmit` web : `getUserInitials(user)` compile ; aucune **nouvelle** erreur (les 2 `.data`
      pré-existent sur `main`).
- [ ] Commit + push `claude/sharp-wozniak-k04xk9` ; PR vers `main` ; CI verte ; **merge squash**.

## Hors périmètre (consigné dans l'analyse)
- F26c-c(b) famille contacts (prop), F26c-c(c) `app/u/[id]`, F26c-e DetailsHeader (nom conversation),
  F25b, F2, F10, F21.

## Continuité
Iter 57 : F26c-c(b) — famille contacts (`ContactsList` + 4 tabs) `getUserDisplayName(x).slice(0,2)`
→ `getUserInitials` (refactor prop coordonné), ou F26c-c(c) page profil `app/u/[id]`.

## Incidents de merge (parallélisme multi-agents)
- Avant de committer, re-vérifier `origin/main` ; si `app/admin/users/page.tsx` a déjà été convergé
  par un commit parallèle, fermer cette itération comme doublon et passer au scout suivant.

## Statut (mis à jour en fin d'itération)
- [x] Phase A — 2 avatars admin/users délèguent à `getUserInitials` ; import ajouté.
- [x] Phase B — `tsc` web : aucune nouvelle erreur ; commit + push + PR + CI + merge.
