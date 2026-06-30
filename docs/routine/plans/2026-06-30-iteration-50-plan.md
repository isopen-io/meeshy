# Iteration 50 — Plan d'implémentation (2026-06-30)

## Objectif
Lot « Source unique du nom d'affichage utilisateur — copies locales sûres (F26b-safe) » : faire
déléguer les 2 copies **locales de composant** de `getUserDisplayName` à priorité identique au
canonique (`FriendRequestCard` fallback `'?'`, page contacts `userDisplayName` fallback `''`) au
canonique testé `apps/web/utils/user-display-name.ts`, via le paramètre `fallback`.

## Pré-requis runner (parité CI)
- [x] `packages/shared` `dist/` présent.
- [ ] Baseline : web jest `__tests__/utils/user-display-name.test.ts` vert (33/33).

## Étapes (délégation à une SSOT déjà testée — pas de nouveau RED)

### Phase A — `apps/web/components/v2/FriendRequestCard.tsx`
- [ ] Supprimer le `function getUserDisplayName(user?)` local (l.28-33).
- [ ] Ajouter `import { getUserDisplayName } from '@/utils/user-display-name';`.
- [ ] Call-site l.58 : `getUserDisplayName(otherUser, '?')` (préserve le fallback `'?'`).

### Phase B — `apps/web/app/(connected)/contacts/page.tsx`
- [ ] Supprimer le `function userDisplayName(u?)` local (l.59-63).
- [ ] Ajouter `import { getUserDisplayName } from '@/utils/user-display-name';`.
- [ ] Call-site l.285 : `getUserDisplayName(other, '') || otherId` (préserve le fallback `''`).
- [ ] `getInitials` local **inchangé** (F26c, hors périmètre).

### Phase C — Vérification & livraison
- [ ] `node_modules/.bin/jest __tests__/utils/user-display-name.test.ts` → 33/33.
- [ ] Suites web jest touchant ces composants (si existantes) vertes.
- [ ] `tsc --noEmit` web : aucune nouvelle erreur sur les 2 fichiers touchés.
- [ ] Commit + push `claude/sharp-wozniak-kthrl5` (force-with-lease : la branche contient l'historique
      iter 49 déjà mergé) ; PR vers `main` ; CI verte ; **merge squash**.

## Hors périmètre (consigné dans l'analyse)
F26b-div (`user.ts` name-first, `MemberSelectionStep` username-first — décision produit), F26c
(`getInitials`), F25b (téléphone), F24b, F2/F10/F21.

## Continuité
Iter 51+ : **F26b-div** (décision produit sur la priorité canonique, puis bascule des 2 divergents)
ou **F26c** (`getInitials` canonique + tests par composant) ; sinon nouveau scout (slug/url,
sanitize, date-relative `classifyRelativeTime` déjà canonique → vérifier les copies). F25b dès
qu'une façade est conçue. F2/F10/F21 dès qu'une fenêtre staging/backfill existe.

## Incidents de merge (parallélisme multi-agents)
- À surveiller : un commit parallèle pourrait réintroduire un corps local. En cas de conflit,
  restaurer les délégations au canonique avec le fallback adéquat.

## Statut (mis à jour en fin d'itération)
- [x] Phase A — `FriendRequestCard` : `getUserDisplayName` local supprimé → canonique avec fallback
      `'?'` (call-site l.58 `getUserDisplayName(otherUser, '?')`).
- [x] Phase B — page contacts : `userDisplayName` local supprimé → canonique avec fallback `''`
      (call-site `getUserDisplayName(other, '') || otherId`). `getInitials` local inchangé (F26c).
- [x] Phase C — web jest `user-display-name` **33/33** ; `tsc --noEmit` web : **aucune** erreur sur
      les fichiers touchés ; aucun test ne référence ces composants (couverts par le canonique) ;
      commit + push (force-with-lease) + PR + merge squash.
