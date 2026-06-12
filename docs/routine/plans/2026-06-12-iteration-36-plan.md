# Iteration 36 — Plan d'implémentation (2026-06-12)

## Objectif
Lot web désigné par le plan iter 35 (F11 + extension Famille A découverte à l'audit) :
unifier TOUT le rendu de présence « 1 dot » sur la feuille `ParticipantPresenceIndicator`
(iter 35), désabonner `ConversationHeader` et `ConversationSettingsModal` du tick de
présence, rendre vivante la présence figée d'`ActiveUsersSection`. Zéro changement de
payload wire ; un correctif d'affichage assumé (sidebar : présence live + décroissance).

## Étapes (TDD : RED → GREEN)

### Phase 1 — HeaderAvatar via feuille, hook désabonné (A1)
- [x] RED : `__tests__/components/conversations/HeaderAvatar.test.tsx` — direct non-anonyme :
      le dot reflète le statut du STORE pour `userId` (real user-store), se met à jour sur
      `updateUserStatus`, décroissance via `triggerStatusTick`, fallback `presenceFallback`
      quand le store ne connaît pas le user ; anonyme/groupe : pas de dot (6 tests)
- [x] GREEN : `header/types.ts` — `ParticipantInfo.status: UserStatus` →
      `otherUserId?: string` + `presenceFallback?: PresenceSource | null` (type exporté
      depuis la feuille) ; `use-participant-info.ts` — suppression `useUserStatusTick`/
      `getUserById`/`getOtherParticipantStatus`, remplacés par
      `getOtherParticipantPresence()` 100 % dérivé des props (le hook n'importe PLUS le
      user store) ; `HeaderAvatar.tsx` — props `status` → `userId`/`presenceFallback`,
      rend `ParticipantPresenceIndicator` (drop cast `as unknown`) ;
      `ConversationHeader.tsx` — passage des nouvelles props
- [x] `ConversationHeader.test.tsx` : suite en échec IDENTIQUE sur main (resolver
      `./participant.js` dans les sources shared, préexistant) — pas de mock à aligner,
      la couverture passe par la nouvelle suite HeaderAvatar

### Phase 2 — ConversationSettingsModal désabonné (A2)
- [x] RED prévu dans `ConversationSettingsModal.test.tsx` : suite en échec IDENTIQUE sur
      main (même resolver préexistant) — le comportement de la feuille est déjà couvert
      par ses 5 tests + les 6 de HeaderAvatar (même intégration userId+fallback)
- [x] GREEN : drop `statusTick`/`getUserById`/`otherUserStatus` (useMemo) + imports
      `OnlineIndicator`/`getUserStatus`/user-store, feuille `userId={otherUser.id}`
      `fallbackUser={otherUser}` à la place de l'`OnlineIndicator`

### Phase 3 — ActiveUsersSection vivante (A3)
- [x] RED : `__tests__/components/conversations/ActiveUsersSection.test.tsx` — statut store
      prioritaire sur prop, mise à jour sur `updateUserStatus`, décroissance sur
      `triggerStatusTick`, fallback payload, état vide (5 tests)
- [x] GREEN : row → `ParticipantPresenceIndicator` (`userId`, `fallbackUser`, `size="sm"`),
      suppression du double `getUserStatus(user)`

### Phase 4 — Vérification & livraison
- [x] Jest web : HeaderAvatar 6/6, ActiveUsersSection 5/5, ParticipantPresenceIndicator 5/5 ;
      run `__tests__/components/conversations` + `__tests__/stores` : 16 suites en échec
      IDENTIQUES à main (diff baseline = seulement les 2 nouvelles suites PASS)
- [x] `tsc --noEmit` web : 1046 erreurs vs 1048 sur main — aucune nouvelle, 2 en moins
      (les casts `status as unknown` supprimés)
- [ ] Commit + push `claude/inspiring-euler-lcmj02`, PR vers `main`, CI verte, merge

## Hors périmètre (consigné dans l'analyse)
- F2 : flip `SOCKET_LANG_FILTER` (validation staging)
- F4 : pollings admin → events Socket.IO (events gateway à créer)
- F10 : scalaire `conversationId` dénormalisé sur Notification (volumétrie)
- F12+F13 : présence contacts (dots + labels TEXTE figés, 5 fichiers) et pickers — lot dédié

## Continuité
Iter 37+ : F12+F13 (lot contacts/pickers, réutilisation directe de la feuille — désigné
prioritaire car dernier foyer de présence figée), puis F4 (events admin), F2 (mesure
staging), F10 (si volumétrie).

## Statut (mis à jour en fin d'itération)
- [x] Phase 1 — header désabonné, feuille dans HeaderAvatar
- [x] Phase 2 — modal settings désabonné
- [x] Phase 3 — sidebar présence vivante
- [ ] Phase 4 — CI verte, mergé dans main
