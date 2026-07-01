# Iteration 59 — Plan d'implémentation (2026-07-01)

## Objectif
Lot « Restaurer la convergence initiales contacts (anti-régression F26c-c(b)) » : les 5 composants
contacts convergés en iter 57 (`getUserInitials`) ont **régressé** vers `.slice(0,2)` via le commit
iOS/SDK `88bc5c71` (bad-merge). Restaurer l'état iter 57 — vraies initiales, cohérence produit.

## Étapes

### Phase A — Restauration exacte
- [x] `git show 88bc5c71 -- apps/web/components/contacts/ | git apply -R` (reverse-apply propre
      vérifié `--check`) → +import `getUserInitials` + `getUserInitials(x)` dans les 5 fichiers :
      `ContactsList.tsx`, `tabs/PendingRequestsTab.tsx`, `tabs/ConnectedContactsTab.tsx`,
      `tabs/AffiliatesTab.tsx`, `tabs/RefusedRequestsTab.tsx`.
- [x] Prop `getUserDisplayName` conservé (libellés + `alt`).

### Phase B — Vérification & livraison
- [x] `grep "slice(0, *2)" apps/web/components/contacts/` → **0**.
- [x] `tsc --noEmit` web : **0 erreur** sur les 5 fichiers restaurés.
- [x] Aucun test ne rend ces composants (verrou de sortie absent — constat iter 57).
- [ ] Commit + push `claude/sharp-wozniak-6lwbw0` (force-with-lease, resync) ; PR vers `main` ;
      CI verte ; **merge squash**.

## Hors périmètre (consigné dans l'analyse)
`AdminLayout.tsx:239` (user → `getUserInitials`) ; troncatures de **titres** (conversation/
communauté → canonique `getInitials(string)`, cluster distinct) ; F25b, F2, F10, F21.

## Continuité
Iter 60 : `AdminLayout.tsx:239` `getUserInitials(user)` (dernière troncature d'initiale sur objet
user), puis créer/consommer un canonique `getInitials(string)` pour les initiales de **titres**
(conversation/communauté) — cluster distinct.

## Incidents de merge (parallélisme multi-agents)
- **Leçon renforcée** : un commit d'un autre domaine (iOS/SDK `88bc5c71`) a écrasé une convergence
  web déjà mergée (iter 57). Au début de chaque itération : `git fetch origin main` **et**
  ré-auditer par `grep` les familles SSOT déjà traitées — « fait » ≠ « toujours en place ».
- Avant de committer, re-vérifier `origin/main` ; si un commit parallèle a déjà restauré ces 5
  fichiers, fermer comme doublon.

## Statut (mis à jour en fin d'itération)
- [x] Phase A — 5 composants contacts restaurés sur `getUserInitials` (reverse-apply exact).
- [x] Phase B — grep 0 troncature ; `tsc` 0 nouvelle erreur.
- [ ] Livraison — commit + push + PR + CI + merge.
