# TODO — Cap membres 199+ et listing top-99 (2026-08-20)

Demande : listing conversations affiche 199+ au-delà de 199 membres (sauf admin plateforme = exact),
et le listing des membres est restreint aux 99 plus actifs pour un USER plateforme / member de
conversation, sauf rôle > member dans la communauté de la conversation. Dernier commit avec (beta).

## Shared
- [ ] `packages/shared/utils/member-visibility.ts` : MEMBER_COUNT_DISPLAY_CAP=199,
      ACTIVE_MEMBER_LISTING_LIMIT=99, presentMemberCount(), isMemberListingRestricted()
- [ ] Type `Conversation.memberCountCapped?: boolean` (types/conversation.ts)
- [ ] Schémas Fastify : memberCountCapped dans conversationMinimalSchema + conversationSchema,
      totalCountCapped dans le schéma pagination de la route participants
- [ ] socketio-events.ts : memberCountCapped? sur les 4 payloads membership

## Gateway (tests d'abord)
- [ ] GET /conversations : cap 199 + flag pour non-admin plateforme, exact pour ADMIN/BIGBOSS
- [ ] GET /conversations/:id : idem
- [ ] GET /conversations/search : idem
- [ ] GET /conversations/:id/participants : pagination.totalCount cappé + flag
- [ ] Mode restreint participants : USER+member sans rôle communauté élevé → top-99 par activité
      (ConversationMessageStats.participantStats : messageCount desc, lastMessageAt desc,
      complément isOnline/joinedAt), filtres+pagination sur la liste restreinte
- [ ] Events socket membership : memberCount plafonné + flag

## Web (tests d'abord)
- [ ] transformers.service.ts : propager memberCountCapped
- [ ] LentilleFocusCard : afficher 199+ quand capped
- [ ] Drawer participants : titre (199+) quand capped
- [ ] use-socket-cache-sync applyMemberCount : propager le flag

## iOS (tests d'abord)
- [ ] MeeshyConversation.memberCountCapped (CodingKeys+decode+encode, round-trip GRDB)
- [ ] APIConversation + toDomain
- [ ] Events socket + ConversationListViewModel.memberCountAfterMembershipEvent
- [ ] Affichage listing : ThemedConversationRow, ConversationListHelpers, LentilleFocusCard,
      ConversationInfoSheet stat (helper memberCountDisplay)

## Gates & livraison
- [ ] Tests gateway ciblés (bun) + tsc
- [ ] Tests web ciblés
- [ ] ./apps/ios/meeshy.sh build + tests ciblés
- [ ] Commits par surface (chemins explicites — session concurrente active sur gateway/attachments),
      dernier commit iOS avec (beta) dans le titre, push main
