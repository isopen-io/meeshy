# Iteration 35 — Plan d'implémentation (2026-06-12)

## Objectif
Lot gateway+web désigné par le plan iter 34 (F7+F8 gateway, F9 web) : auto-marquage des
notifications en 1 requête Mongo hors chemin critique, trim du select participants du détail,
extraction de l'indicateur de présence en composant feuille. Zéro changement de payload wire ;
deux correctifs de comportement assumés (cloche resynchronisée à l'ouverture du détail,
réponse détail plus rapide).

## Étapes (TDD : RED → GREEN)

### Phase 1 — Notifications : marquage par contexte en 1 requête (F7)
- [x] RED : nouveau `unit/services/NotificationService.markContextRead.test.ts` (le fichier
      `notifications-security.test.ts` est EXCLU du run jest via testPathIgnorePatterns —
      découvert pendant l'iter ; mis à jour quand même pour cohérence) — le service émet UN
      SEUL `$runCommandRaw` `update Notification` filtré `{ userId: {$oid}, isRead: false,
      'context.conversationId': X }` (multi), AUCUN `findMany` ; early-return 0 si userId
      non-ObjectId (anonyme) ; `notification:counts` émis si count > 0, pas émis si 0 ;
      retour 0 sans throw si Mongo échoue
- [x] GREEN : `NotificationService.ts` — helper privé `markContextNotificationsAsRead(userId,
      contextKey, contextValue)` via `$runCommandRaw` ; `markConversationNotificationsAsRead`
      et `markPostNotificationsAsRead` délèguent (6 tests verts)
- [x] `routes/conversations/core.ts` — bloc inline findMany+filter+updateMany remplacé par
      une délégation fire-and-forget à `fastify.notificationService` (pattern
      `posts/interactions.ts:248`), hors du chemin de la réponse — et la cloche/badge est
      désormais resynchronisée à l'ouverture du détail (le bloc inline n'émettait pas)

### Phase 2 — Trim du select participants du détail (F8)
- [x] RED : `conversation-detail-include.test.ts` réécrit — `select` strict (id, userId, type,
      displayName, avatar, role, permissions, isActive, isOnline, lastActiveAt, joinedAt) ;
      PAS de `sessionTokenHash` / `anonymousSession` / `nickname` / `leftAt` / `bannedAt` /
      `deletedForMe` / `shareLinkId` / `language` / `conversationId` ; user réduit aux champs
      du titre (id, username, displayName, firstName, lastName)
- [x] GREEN : `core.ts` — `conversationDetailInclude` participants `include` → `select`
      (7 tests verts)

### Phase 3 — Indicateur de présence en feuille (F9)
- [x] RED : `__tests__/components/conversations/ParticipantPresenceIndicator.test.tsx` —
      statut du store, mise à jour sur `updateUserStatus`, fallback prop, offline par défaut,
      décroissance online→away déclenchée par `triggerStatusTick` (5 tests)
- [x] GREEN : `components/conversations/conversation-item/ParticipantPresenceIndicator.tsx` —
      feuille mémoïsée : `useUserById(userId)` + `useUserStatusTick()` + `getUserStatus` →
      `OnlineIndicator`
- [x] `ConversationItem.tsx` — abonnements `getUserById`/`_presenceTick` supprimés, IIFE
      remplacée par la feuille (fallback = user du payload conversation)

### Phase 4 — Vérification & livraison
- [x] Jest gateway : markContextRead 6/6, conversation-detail-include 7/7, unit/routes +
      MessageReadStatusService + 13 suites notifications (235 tests) verts ;
      `participants.test.ts` 9 échecs IDENTIQUES sur main (préexistant, hors périmètre) ;
      `tsc --noEmit` gateway propre
- [x] Jest web : ParticipantPresenceIndicator 5/5, user-store vert ; 13 suites conversations
      en échec IDENTIQUES sur main (préexistant) ; tsc web — erreurs uniquement sur les casts
      `as unknown` préexistants de ConversationItem (iso-main), rien sur les nouveaux fichiers
- [ ] Commit + push `claude/inspiring-euler-pwt6b3`, PR vers `main`, CI verte, merge

## Hors périmètre (consigné dans l'analyse)
- F2 : flip `SOCKET_LANG_FILTER` (validation staging)
- F4 : pollings admin → events Socket.IO (events gateway à créer)
- F10 : scalaire `conversationId` dénormalisé sur Notification (utile seulement à fort volume)
- F11 : décroissance figée `HeaderAvatar`/`ActiveUsersSection` (réutiliser la feuille iter 35)

## Continuité
Iter 36+ : F11 (réutilisation directe de `ParticipantPresenceIndicator`, faible risque),
F4 quand les events gateway existent, F2 quand la mesure staging est disponible, F10 si la
volumétrie notifications le justifie.

## Statut (mis à jour en fin d'itération)
- [ ] Phase 1 — notifications 1 requête + fire-and-forget
- [ ] Phase 2 — select participants détail
- [ ] Phase 3 — feuille présence
- [ ] Phase 4 — CI verte, mergé dans main
