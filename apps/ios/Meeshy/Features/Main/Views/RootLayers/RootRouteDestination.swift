import SwiftUI
import MeeshySDK
import MeeshyUI

/// L'écran poussé pour une `Route` dans la `NavigationStack` de `RootView`.
///
/// Une struct NOMINALE, et non une fermeture `@ViewBuilder` inline (#5837) : le
/// type de retour de la fermeture est un paramètre générique de
/// `navigationDestination(for:destination:)`, donc les 27 cas de ce `switch` —
/// arbre `_ConditionalContent` PLUS la chaîne de modificateurs de chaque cas —
/// entraient dans le type concret de `RootView.body`, une dizaine de niveaux à
/// eux seuls. Ici, la racine ne voit qu'un nom ; le `switch` est matérialisé
/// dans le nœud d'attribut de cette vue, pile déroulée.
struct RootRouteDestination: View {
    let route: Route
    @ObservedObject var router: Router
    let notificationManager: NotificationToastManager
    let onNotificationTap: (APINotification) -> Void

    var body: some View {
        switch route {
        case .conversation(let conv):
            ConversationView(
                conversation: conv,
                replyContext: router.pendingReplyContext,
                // I-075 — override éphémère, jamais persistant :
                // consommé ici comme `pendingReplyContext`
                // ci-dessus, jamais écrit en préférence.
                forcedReadingMode: router.pendingForcedReadingMode
            )
            // Identité par conversation — même fix que iPadRootView.
            // `Router.navigateToConversation` REMPLACE la pile en une
            // mutation (`path = [.conversation(B)]`) : déjà dans la
            // conversation A, un tap sur la notification de B réutilise
            // cette vue à la même profondeur — la prop `conversation`
            // change (header OK) mais le @StateObject viewModel créé
            // pour A survit et `.task` ne se relance pas : le contenu
            // restait sur A. `.id` force le teardown (flush du
            // brouillon de A via onDisappear) + une vue neuve pour B.
            .id(conv.id)
            .navigationBarHidden(true)
            .onAppear {
                router.pendingReplyContext = nil
                router.pendingForcedReadingMode = nil
            }
        case .settings:
            SettingsView()
                .navigationBarHidden(true)
        case .profile:
            ProfileView()
                .navigationBarHidden(true)
        case .contacts(let initialTab):
            ContactsHubView(initialTab: initialTab)
                .navigationBarHidden(true)
        case .peopleDiscovery(let initialTab):
            PeopleDiscoveryView(initialTab: initialTab)
                .navigationBarHidden(true)
        case .nearbyDiscovery(let initialCoordinate):
            NearbyDiscoveryView(initialCoordinate: initialCoordinate?.coordinate)
                .navigationBarHidden(true)
        case .communityList:
            CommunityListView(
                onSelectCommunity: { community in
                    router.push(.communityDetail(community.id))
                },
                onCreateCommunity: {
                    router.push(.communityCreate)
                },
                onDismiss: { router.pop() }
            )
            .navigationBarHidden(true)
        case .communityDetail(let communityId):
            CommunityDetailView(
                communityId: communityId,
                onSelectConversation: { apiConversation in
                    let currentUserId = AuthManager.shared.currentUser?.id ?? ""
                    let conv = apiConversation.toConversation(currentUserId: currentUserId)
                    router.push(.conversation(conv))
                },
                onOpenSettings: { community in
                    router.push(.communitySettings(community))
                },
                onOpenMembers: { id in
                    router.push(.communityMembers(id))
                },
                onInvite: { id in
                    router.push(.communityInvite(id))
                },
                onDismiss: { router.pop() }
            )
            .navigationBarHidden(true)
        case .communityCreate:
            CommunityCreateView(
                onCreated: { community in
                    router.pop()
                    router.push(.communityDetail(community.id))
                },
                onDismiss: { router.pop() }
            )
            .navigationBarHidden(true)
        case .communitySettings(let community):
            CommunitySettingsView(
                community: community,
                onUpdated: { _ in router.pop() },
                onDeleted: { router.popToRoot() },
                onLeft: { router.popToRoot() }
            )
        case .communityMembers(let communityId):
            CommunityMembersView(
                communityId: communityId,
                onInvite: {
                    router.push(.communityInvite(communityId))
                }
            )
        case .communityInvite(let communityId):
            // Poussée dans la pile : `dismiss()` interne à son propre
            // NavigationStack est inerte, « Done » ne fermait rien.
            CommunityInviteView(communityId: communityId, onDone: { router.pop() })
        case .notifications:
            NotificationListView(
                onNotificationTap: { notification in
                    onNotificationTap(notification)
                },
                onDismiss: { router.pop() }
            )
            .navigationBarHidden(true)
            .onDisappear {
                Task { await notificationManager.refreshUnreadCount() }
            }
        case .userStats:
            UserStatsView()
                .navigationBarHidden(true)
        case .progression:
            ProgressionView()
                .navigationBarHidden(true)
        case .links:
            LinksHubView()
        case .affiliate:
            AffiliateView()
                .navigationBarHidden(true)
        case .trackingLinks:
            TrackingLinksView()
                .navigationBarHidden(true)
        case .shareLinks:
            ShareLinksView()
                .navigationBarHidden(true)
        case .communityLinks:
            CommunityLinksView()
                .navigationBarHidden(true)
        case .dataExport:
            DataExportView()
                .navigationBarHidden(true)
        case .postDetail(let postId, let initialPost, let showComments, let commentId, let parentCommentId):
            PostDetailView(postId: postId, initialPost: initialPost, showComments: showComments, targetCommentId: commentId, targetParentCommentId: parentCommentId)
        case .hashtagResults(let tag):
            HashtagResultsView(tag: tag)
        case .bookmarks:
            // Pas de `navigationBarHidden` : cet écran n'a pas
            // d'en-tête maison, la barre système porte son titre ET
            // son retour. La masquer en ferait un cul-de-sac.
            BookmarksView()
        case .starredMessages:
            StarredMessagesView()
        case .friendRequests:
            FriendRequestListView()
                .navigationBarHidden(true)
        case .storyNotificationTarget(let storyId, let intent, let context, let commentId, let parentCommentId):
            StoryNotificationTargetScreen(
                storyId: storyId,
                intent: intent,
                context: context,
                commentId: commentId,
                parentCommentId: parentCommentId
            )
        }
    }
}
