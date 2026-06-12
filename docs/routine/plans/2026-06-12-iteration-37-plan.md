# Iteration 37 — Plan d'implémentation (2026-06-12)

## Objectif
Lot désigné par le plan iter 36 : **F12+F13** — éliminer le dernier foyer de présence
figée du web (pages contacts + pickers). Extraction du hook `useLiveUserStatus`
(single source of truth de la résolution de présence rendue), feuilles texte
`UserPresenceBadge`/`UserPresenceLabel`, substitution dans 7 composants. Zéro changement
de payload wire ; correctif d'affichage assumé (présence live + décroissance).

## Étapes (TDD : RED → GREEN)

### Phase 1 — Hook `useLiveUserStatus` (A1)
- [x] RED : `__tests__/hooks/use-live-user-status.test.tsx` — statut store prioritaire,
      mise à jour sur `updateUserStatus`, décroissance sur `triggerStatusTick`, fallback
      payload quand le store ne connaît pas le user, offline sans source (5 tests,
      real user-store comme les suites iter 35/36)
- [x] GREEN : `hooks/use-live-user-status.ts` — `useUserById` + `useUserStatusTick` +
      `getUserStatus(store ?? fallback)` ; `PresenceSource` exporté depuis
      `lib/user-status.ts` ; `ParticipantPresenceIndicator` réécrit sur le hook
      (ré-export `PresenceSource` conservé) — sa suite existante (5 tests) reste verte

### Phase 2 — Feuilles texte (A2)
- [x] RED : `__tests__/components/presence/UserPresenceBadge.test.tsx` (4 tests : libellé
      store, update event, décroissance tick, fallback payload) et
      `UserPresenceLabel.test.tsx` (5 tests : idem + `children` surchargeant le texte)
- [x] GREEN : `components/presence/UserPresenceBadge.tsx` + `UserPresenceLabel.tsx`
      (memo, props `userId`/`fallbackUser`/`t`, mapping statut → couleurs/libellés
      identique à l'existant : green-500 / orange-400 / gray-400, clés `status.*`)

### Phase 3 — Substitutions (A3)
- [x] `ContactsList.tsx` : dot avatar → `ParticipantPresenceIndicator`, Badge IIFE →
      `UserPresenceBadge`, dot inline + `formatLastSeen` → `UserPresenceLabel` avec
      `children` ; drop imports `getUserStatus`/`OnlineIndicator`/`Badge`
- [x] `ConnectedContactsTab.tsx` + `AffiliatesTab.tsx` : dot avatar → feuille,
      bloc dot+label IIFE → `UserPresenceLabel`
- [x] `PendingRequestsTab.tsx` + `RefusedRequestsTab.tsx` : dot avatar → feuille
- [x] `user-selector.tsx` + `MemberSelectionStep.tsx` : dot → feuille (F13)

### Phase 4 — Vérification & livraison
- [x] Jest : 4 suites présence 19/19 PASS + HeaderAvatar/ActiveUsersSection (iter 36)
      6+5 PASS ; baseline `__tests__/components/{conversations,common}` + `__tests__/hooks`
      strictement IDENTIQUE à main (diff des suites FAIL = vide)
- [x] `tsc --noEmit` local inopérant (TS récent rejette `downlevelIteration` de la config —
      préexistant, indépendant du lot) ; la CI ne gate pas tsc web, couverture par Jest
- [ ] Commit + push `claude/inspiring-euler-y27pmt`, PR vers `main`, CI verte, merge

## Hors périmètre (consigné dans l'analyse)
- F2 : flip `SOCKET_LANG_FILTER` (validation staging)
- F4 : pollings admin → events Socket.IO (events gateway à créer)
- F10 : scalaire `conversationId` dénormalisé sur Notification (volumétrie)
- F14 : texte `formatLastSeen` relatif vivant (décision produit)

## Continuité
Iter 38+ : F4 (events admin — plus gros lot restant), F2 (mesure staging), F10 (si
volumétrie), F14 (si décision produit).

## Statut (mis à jour en fin d'itération)
- [x] Phase 1 — hook extrait, feuille dot réécrite dessus
- [x] Phase 2 — feuilles badge/label
- [x] Phase 3 — 7 composants substitués
- [ ] Phase 4 — CI verte, mergé dans main
