# Iteration 58 — Plan d'implémentation (2026-07-01)

## Objectif
Lot « Source unique des initiales — profil public — F26c-c(c) » : remplacer la **dernière**
dérivation d'initiales par troncature brute (`app/u/[id]/page.tsx:346`
`getUserDisplayName(user).slice(0,2).toUpperCase()`) par le canonique `getUserInitials`
(`@/lib/avatar-utils`) — vraies initiales cohérentes avec tout le produit.

## Note de resynchronisation
Le lot F23 initialement engagé cette itération a été **abandonné** : déjà mergé sur `main`
(iter 46 / F23b) avec une meilleure implémentation. Branche resynchronisée sur `origin/main`
(iter 57) avant de reprendre. Voir l'analyse iter 58 pour le détail.

## Étapes (délégation → vérification)

### Phase A — Converger le composant
- [x] `app/u/[id]/page.tsx` : import `{ getUserInitials }` from `@/lib/avatar-utils`.
- [x] l.346 → `{getUserInitials(user)}` (remplace `getUserDisplayName(user).slice(0,2).toUpperCase()`).
- [x] Conserver `getUserDisplayName` local (libellés/titre l.319, l.363) — même source `resolveDisplayName`.

### Phase B — Vérification & livraison
- [ ] `grep "DisplayName(...).slice(0,2)"` sur `apps/web/**/*.tsx` → **0** occurrence (fait : confirmé).
- [ ] `tsc --noEmit` web : l'appel compile (`user: User` ⊆ `UserNameSource`) ; aucune **nouvelle** erreur.
- [ ] Commit + push `claude/sharp-wozniak-6lwbw0` (force-with-lease, branche resync) ; PR #1131
      repurposée vers iter 58 ; CI verte ; **merge squash**.

## Hors périmètre (consigné dans l'analyse)
F26c-e (nom conversation), F25b, F2 (staging), F10 (backfill), F21 (backfill).

## Continuité
Iter 59 : F26c-e (nom de conversation) si une troncature d'initiale subsiste, sinon nouveau
domaine (audit BP F2/F10 dès qu'une fenêtre staging/backfill existe).

## Incidents de merge (parallélisme multi-agents)
- **Avant de committer, re-vérifier `origin/main`** : si `app/u/[id]/page.tsx:346` a déjà été
  convergé par un commit parallèle, fermer comme doublon.
- Rappel process : `git fetch origin main && git rev-list --count HEAD..origin/main` **au début**
  de chaque itération pour ne pas repartir d'une base périmée.

## Statut (mis à jour en fin d'itération)
- [x] Phase A — import ajouté ; l.346 délègue à `getUserInitials`. Dernière `.slice(0,2)`
      d'initiale d'identité éliminée dans `apps/web` (grep confirmé à 0).
- [ ] Phase B — `tsc` web sans nouvelle erreur ; commit + push + PR + CI + merge.
