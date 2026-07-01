# Iteration 57 — Plan d'implémentation (2026-07-01)

## Objectif
Lot « Source unique des initiales — famille contacts — F26c-c(b) » : remplacer les 5 dérivations
`getUserDisplayName(x).slice(0, 2).toUpperCase()` des composants contacts par le canonique
`getUserInitials` (`@/lib/avatar-utils`), pour des vraies initiales cohérentes avec tout le produit.

## Pré-requis runner (parité CI)
- [x] `bun install` (jest web présent).
- [x] Aucun test dédié ne rend `ContactsList`/tabs pour asserter les initiales.
- [x] 2 erreurs TS `pendingRequest.id` (ContactsList) confirmées **pré-existantes** sur `main`.

## Étapes (délégation → vérification)

### Phase A — Converger les 5 composants
- [x] `ContactsList.tsx` : import `getUserInitials` ; l.91 → `{getUserInitials(contact)}`.
- [x] `tabs/PendingRequestsTab.tsx` : import ; l.76 → `{getUserInitials(otherUser)}`.
- [x] `tabs/ConnectedContactsTab.tsx` : import ; l.89 → `{getUserInitials(otherUser)}`.
- [x] `tabs/AffiliatesTab.tsx` : import ; l.68 → `{getUserInitials(relation.referredUser)}`.
- [x] `tabs/RefusedRequestsTab.tsx` : import ; l.77 → `{getUserInitials(otherUser)}`.
- [x] Conserver le prop `getUserDisplayName` (libellés + `alt`).

### Phase B — Vérification & livraison
- [x] `tsc --noEmit` web : les 5 appels compilent ; aucune **nouvelle** erreur (les 2 `pendingRequest.id`
      pré-existent sur `main`).
- [ ] Commit + push `claude/sharp-wozniak-k04xk9` ; PR vers `main` ; CI verte ; **merge squash**.

## Hors périmètre (consigné dans l'analyse)
- F26c-c(c) `app/u/[id]`, F26c-e (nom conversation), F25b, F2, F10, F21.

## Continuité
Iter 58 : F26c-c(c) — `app/u/[id]/page.tsx:346` `getUserDisplayName(user).slice(0,2)` →
`getUserInitials` (dernière `.slice(0,2)` d'initiale d'identité), puis F26c-e (nom de conversation)
ou nouveau domaine.

## Incidents de merge (parallélisme multi-agents)
- Avant de committer, re-vérifier `origin/main` ; si un des 5 fichiers contacts a déjà été convergé
  par un commit parallèle, ne garder que les fichiers restants (ou fermer comme doublon si tous faits).

## Statut (mis à jour en fin d'itération)
- [x] Phase A — 5 composants contacts délèguent à `getUserInitials` ; imports ajoutés ; prop conservé.
- [x] Phase B — `tsc` web : aucune nouvelle erreur ; commit + push + PR + CI + merge.
