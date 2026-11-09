import SwiftUI
import MeeshySDK
import MeeshyUI

final class RouterCommands {
    static let inert = RouterCommands(router: nil)

    private weak var router: Router?

    init(router: Router?) {
        self.router = router
    }

    nonisolated deinit {}

    func push(_ route: Route) {
        router?.push(route)
    }

    func pop() {
        router?.pop()
    }

    func popToRoot() {
        router?.popToRoot()
    }

    /// Le disque de tête du détail d'un post : ✕ sur la feuille, « Retour »
    /// dans le panneau de l'iPad (#16676).
    var postDetailHeaderGlyph: CollapsibleHeaderBackGlyph {
        router?.presentsPostDetailAsSheet == false ? .back : .close
    }

    /// Ferme le détail d'un post : sa feuille, ou sa page hors feuille (#16676).
    func closePostDetail() {
        router?.closePostDetail()
    }

    func navigateToConversation(_ conversation: Conversation, highlightMessageId: String? = nil) {
        router?.navigateToConversation(conversation, highlightMessageId: highlightMessageId)
    }

    func openGame(at target: Route) {
        router?.openGame(at: target)
    }

    func openPostDetail(_ post: FeedPost, from origin: OpenOrigin) {
        router?.openPostDetail(post, from: origin)
    }

    func openPostDetail(id postId: String, from origin: OpenOrigin) {
        router?.openPostDetail(id: postId, from: origin)
    }

    func openProfileSheet(_ user: ProfileSheetUser) {
        router?.deepLinkProfileUser = user
    }

    func openProfile(_ user: ProfileSheetUser, inConversation conversationId: String?) {
        router?.openProfile(user, inConversation: conversationId)
    }

    func requestFeedComposer() {
        router?.pendingOpenFeedComposer = true
    }

    func armSearch() {
        router?.pendingOpenSearch = true
    }

    func requestHighlight(messageId: String, inConversation conversationId: String) {
        router?.pendingHighlightMessageId = messageId
        router?.pendingHighlightConversationId = conversationId
    }

    func openPackShop(domain: PackDomain?) {
        router?.openPackShop(domain: domain)
    }

    func openMyPacks() {
        router?.openMyPacks()
    }
}

private struct RouterCommandsKey: EnvironmentKey {
    static let defaultValue = RouterCommands.inert
}

/// Le routeur LUI-MÊME, pour les rares surfaces qui le remettent à un lecteur
/// monté plus bas (l'aperçu d'un composer). Optionnel, donc jamais un piège :
/// absent, la surface se passe de ce qu'il porte au lieu de trapper comme un
/// `@EnvironmentObject` manquant.
private struct MeeshyRouterKey: EnvironmentKey {
    static let defaultValue: Router? = nil
}

extension EnvironmentValues {
    var routerCommands: RouterCommands {
        get { self[RouterCommandsKey.self] }
        set { self[RouterCommandsKey.self] = newValue }
    }

    var meeshyRouter: Router? {
        get { self[MeeshyRouterKey.self] }
        set { self[MeeshyRouterKey.self] = newValue }
    }
}

struct MeeshyRouterInjection: ViewModifier {
    let router: Router

    func body(content: Content) -> some View {
        content
            .environmentObject(router)
            .environment(\.routerCommands, router.commands)
            .environment(\.meeshyRouter, router)
    }
}

extension View {
    @ViewBuilder
    func relayingMeeshyRouter<Relayed: View>(
        _ router: Router?,
        @ViewBuilder _ relay: (Self, Router) -> Relayed
    ) -> some View {
        if let router {
            relay(self, router)
        } else {
            self
        }
    }
}
