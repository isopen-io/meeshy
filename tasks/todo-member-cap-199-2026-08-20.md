# TODO — Cap membres 199+ et listing top-99 (2026-08-20) — LIVRÉ

Demande : listing conversations affiche 199+ au-delà de 199 membres (sauf admin plateforme = exact),
et le listing des membres est restreint aux 99 plus actifs pour un USER plateforme / member de
conversation, sauf rôle > member dans la communauté de la conversation. Dernier commit avec (beta).

## Shared — fait (7fcfd0ea1)
- [x] `packages/shared/utils/member-visibility.ts` : MEMBER_COUNT_DISPLAY_CAP=199,
      ACTIVE_MEMBER_LISTING_LIMIT=99, presentMemberCount(), formatMemberCount(),
      isMemberListingRestricted() — 15 tests vitest
- [x] Type `Conversation.memberCountCapped?: boolean`
- [x] Schémas Fastify : memberCountCapped (minimal + détail), totalCountCapped (pagination
      participants) — gardés par api-schemas-member-count.test.ts
- [x] socketio-events.ts : memberCountCapped? sur les 4 payloads membership

## Gateway — fait (7fcfd0ea1)
- [x] GET /conversations, /conversations/:id, /conversations/search : cap 199 + flag,
      exact pour ADMIN/BIGBOSS
- [x] GET /conversations/:id/participants : totalCount cappé + totalCountCapped
- [x] Mode restreint top-99 (loadMostActiveParticipants) : stats participantStats
      (messageCount desc, lastMessageAt desc), complément isOnline/joinedAt, filtres +
      recherche + pagination SUR la liste bornée ; exemptions : rôle plateforme > USER,
      rôle conversation > member, rôle communauté > member
- [x] 4 fanouts membership plafonnés (broadcast unique — admin récupère l'exact au fetch REST)
- [x] 245 tests verts (participants 95, core 150) + search 20 + fanout 9 ; tsc propre

## Web — fait (efb6dd72b → 95d8f65ac)
- [x] transformers : recopie memberCountCapped
- [x] LentilleFocusCard : 199+ via formatMemberCount
- [x] Drawer participants + HeaderToolbar : titre/aria (199+)
- [x] applyMemberCount : pose effectif + flag ; delta de repli gelé sur compteur plafonné

## iOS — fait (aa6d3fe71 → 408a49ea7, commit (beta))
- [x] MeeshyConversation.memberCountCapped (CodingKeys+decode+encode — round-trip GRDB) +
      memberCountDisplay (« 199+ ») — MemberCountCapTests 7/7
- [x] APIConversation + toConversation ; PaginatedParticipantsPagination.totalCountCapped
- [x] 4 events socket + memberCountAfterMembershipEvent (pose + gel du delta sur cappé)
      — ConversationListViewModelTests 196/196
- [x] Affichage : ThemedConversationRow, ConversationListHelpers, LentilleFocusCard,
      ConversationInfoSheet (memberCountDisplay)

## Livraison
- [x] Push main 408a49ea7 (tête = commit (beta)) → ios-beta-trigger.yml déclenché (run 32366598496)

## Restes connus (hors périmètre, documentés)
- `conversation:stats` (socket) expose participantCount exact — panneau de stats, pas le listing.
- Notification member_joined : metadata.memberCount non plafonné (non filtré isActive).
- Surfaces liens/anonymous (`/conversation/:identifier`, link stats) hors listing, non plafonnées.
- iOS chemin SDK ConversationSettingsView : totalMemberCount déduit de la taille de page
  (CursorPagination sans totalCount) — comportement préexistant.
- InfoSheet section membres affiche participants.count (= taille du listing restreint), la stat
  au-dessus affiche 199+.
