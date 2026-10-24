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
}

private struct RouterCommandsKey: EnvironmentKey {
    static let defaultValue = RouterCommands.inert
}

extension EnvironmentValues {
    var routerCommands: RouterCommands {
        get { self[RouterCommandsKey.self] }
        set { self[RouterCommandsKey.self] = newValue }
    }
}

struct MeeshyRouterInjection: ViewModifier {
    let router: Router

    func body(content: Content) -> some View {
        content
            .environmentObject(router)
            .environment(\.routerCommands, router.commands)
    }
}
