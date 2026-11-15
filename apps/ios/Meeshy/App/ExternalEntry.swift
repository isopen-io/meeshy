import Foundation
import MeeshySDK

enum ExternalEntry: Equatable {
    case shareRelay(id: String)
    case shareCompose(id: String)
    case signIn(SignInLink)
    case deepLink(URL)

    enum Origin: Equatable {
        case openURL
        case browsingActivity
    }

    static func classify(url: URL, origin: Origin) -> ExternalEntry {
        if origin == .openURL {
            if let relayId = ShareRelayHandoff.shareId(from: url) { return .shareRelay(id: relayId) }
            if let composeId = ShareComposeLink.shareId(from: url) { return .shareCompose(id: composeId) }
        }
        if let link = SignInLink(DeepLinkParser.parse(url)) { return .signIn(link) }
        return .deepLink(url)
    }
}

protocol ExternalEntryDispatcherProviding {
    func open(_ entry: ExternalEntry)
    func dial(activity: NSUserActivity)
}

struct LiveExternalEntryDispatcher: ExternalEntryDispatcherProviding {
    let router: DeepLinkRouter

    func open(_ entry: ExternalEntry) {
        switch entry {
        case .shareRelay(let id):
            ShareRelayConsumer.shared.consumeNext(id: id)
        case .shareCompose(let id):
            Task { await ShareComposeHandoffConsumer.shared.consumeNext(id: id) }
        case .signIn(let link):
            Task { await SignInLinkOpener.open(link) }
        case .deepLink(let url):
            _ = router.handle(url: url)
        }
    }

    func dial(activity: NSUserActivity) {
        let mayDial = CallDialReadinessSnapshot.mayQueueDial(
            sessionResolved: AuthManager.shared.hasResolvedStoredSession,
            authenticated: AuthManager.shared.isAuthenticated
        )
        guard mayDial, let request = CallBackRequest(userActivity: activity) else { return }
        CallBackDialer.shared.dial(request)
    }
}
