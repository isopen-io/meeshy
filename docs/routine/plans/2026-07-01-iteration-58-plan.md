# Iteration 58 — Plan d'implémentation (2026-07-01)

## Objectif
Lot « Source unique des initiales — page profil — F26c-c(c) » : remplacer la dernière dérivation
`getUserDisplayName(user).slice(0, 2).toUpperCase()` d'initiale d'identité (`app/u/[id]/page.tsx:346`)
par le canonique `getUserInitials` (`@/lib/avatar-utils`). Clôt le cluster initiales d'identité
utilisateur dans `apps/web`.

## Pré-requis runner (parité CI)
- [x] `bun install` (jest web présent).
- [x] Aucun test ne rend `app/u/[id]/page.tsx`.

## Étapes (délégation → vérification)

### Phase A — Converger la page profil
- [x] Ajouter `import { getUserInitials } from '@/lib/avatar-utils';`.
- [x] l.346 : `AvatarFallback` → `{getUserInitials(user)}`.
- [x] Conserver la fonction locale `getUserDisplayName` (titre layout l.319 + nom l.363).

### Phase B — Vérification & livraison
- [x] `tsc --noEmit` web : `getUserInitials(user)` compile ; aucune erreur sur le fichier touché.
- [ ] Commit + push `claude/sharp-wozniak-k04xk9` ; PR vers `main` ; CI verte ; **merge squash**.

## Hors périmètre (consigné dans l'analyse)
- F26c-e (nom de conversation / creator de lien), F25b, F2, F10, F21.

## Continuité
Iter 59 : cluster initiales d'identité **clos**. Pistes : F26c-e (initiale de nom de conversation via
canonique string dédié — `DetailsHeader`, `conversation-links-section`), ou nouveau domaine hors
initiales (slug/url, sanitize, date-relative, validateurs téléphone F25b).

## Incidents de merge (parallélisme multi-agents)
- Avant de committer, re-vérifier `origin/main` ; si `app/u/[id]/page.tsx` a déjà été convergé par un
  commit parallèle, fermer cette itération comme doublon et passer au scout suivant (F26c-e).

## Statut (mis à jour en fin d'itération)
- [x] Phase A — `app/u/[id]` AvatarFallback délègue à `getUserInitials` ; import ajouté ; fonction
      locale conservée.
- [x] Phase B — `tsc` web sans erreur sur le fichier touché ; commit + push + PR + CI + merge.
