import XCTest
@testable import Meeshy

@MainActor
final class CallDeepLinkTests: XCTestCase {

    private func makeRouter(
        authenticated: Bool = true,
        sessionResolved: Bool = true,
        dialed: @escaping @MainActor (String, Bool) -> Void
    ) -> DeepLinkRouter {
        let defaults = UserDefaults(suiteName: "CallDeepLinkTests.\(UUID().uuidString)")!
        return DeepLinkRouter(
            drafts: DraftStore(userDefaults: defaults, userIdProvider: { "call" }),
            isAuthenticated: { authenticated },
            hasResolvedSession: { sessionResolved },
            dialConversationCall: dialed
        )
    }

    func test_parse_siriCallShortcut_readsTheConversationAndTheCallType() {
        XCTAssertEqual(
            DeepLinkParser.parse(URL(string: "meeshy://call?contactId=conv1&type=video")!),
            .call(conversationId: "conv1", isVideo: true)
        )
        XCTAssertEqual(
            DeepLinkParser.parse(URL(string: "meeshy://call?contactId=conv1&type=audio")!),
            .call(conversationId: "conv1", isVideo: false)
        )
    }

    func test_parse_callWithoutContact_orLiveActivityButtons_routesNothing() {
        let unrouted = ["meeshy://call", "meeshy://call?contactId=%20", "meeshy://call/end", "meeshy://call/mute"]
        for sample in unrouted {
            guard case .external = DeepLinkParser.parse(URL(string: sample)!) else {
                XCTFail("\(sample) ne doit pas composer d'appel")
                continue
            }
        }
    }

    func test_parse_callIsNeverReadFromTheWeb() {
        guard case .external = DeepLinkParser.parse(URL(string: "https://meeshy.me/call?contactId=conv1&type=video")!) else {
            return XCTFail("un lien web ne compose jamais d'appel")
        }
    }

    func test_handle_siriCallShortcut_dialsTheConversation_andLeavesNoPendingLink() {
        var dialed: [(String, Bool)] = []
        let router = makeRouter { dialed.append(($0, $1)) }

        XCTAssertTrue(router.handle(url: URL(string: "meeshy://call?contactId=conv1&type=video")!))

        XCTAssertEqual(dialed.map(\.0), ["conv1"])
        XCTAssertEqual(dialed.map(\.1), [true])
        XCTAssertNil(router.pendingDeepLink)
    }

    func test_handle_siriCallShortcut_withoutSession_dialsNothing() {
        var dialed = 0
        let router = makeRouter(authenticated: false) { _, _ in dialed += 1 }

        XCTAssertFalse(router.handle(url: URL(string: "meeshy://call?contactId=conv1&type=audio")!))

        XCTAssertEqual(dialed, 0)
    }

    func test_handle_siriCallShortcut_beforeTheSessionIsRead_keepsTheCall() {
        var dialed: [String] = []
        let router = makeRouter(authenticated: false, sessionResolved: false) { conversationId, _ in
            dialed.append(conversationId)
        }

        XCTAssertTrue(router.handle(url: URL(string: "meeshy://call?contactId=conv1&type=audio")!))

        XCTAssertEqual(dialed, ["conv1"], "au démarrage à froid, le composeur attend la session au lieu de perdre l'appel")
    }
}
