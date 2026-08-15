import XCTest
import MeeshySDK
@testable import Meeshy

/// R19 (contrat LWS-2bis) : pour chacun des trois protocoles providers, deux
/// implémentations DIFFÉRENTES appelées à travers un consommateur AGNOSTIQUE
/// (qui ne connaît que le protocole, jamais `Local…`/`Gateway…`) produisent
/// des objets ÉGAUX à données égales — et la bascule d'injection entre les
/// deux ne change RIEN d'observable.
///
/// Le stub "gateway" de test ci-dessous n'est PAS `GatewayBridgeProvider`
/// (G-124, hors périmètre de M-048) : c'est un double de test minimal qui
/// conforme au protocole gelé pour prouver la substituabilité elle-même —
/// exactement ce que R19 exige, sans dépendre d'un lot futur.
final class ProviderSubstitutionTests: XCTestCase {

    // MARK: - ConversationBridgeProviding

    /// Double de test imitant la forme du définitif (G-124) : rend un pont
    /// FIXE, sans aucun calcul — à l'opposé de `LocalBridgeProvider`, qui
    /// calcule depuis des messages en cache. Les deux conforment au MÊME
    /// protocole ; c'est tout ce que R19 demande.
    private struct StubGatewayBridgeProvider: ConversationBridgeProviding, Sendable {
        let fixedBridge: ConversationBridge?

        func bridgeFor(conversationId: String, viewerId: String, unreadCount: Int) async -> ConversationBridge? {
            fixedBridge
        }
    }

    /// Consommateur agnostique — modèle réduit de ce qu'un rang de liste
    /// ferait : il ne reçoit que `any ConversationBridgeProviding`, jamais
    /// un type concret.
    private func resolveBridge(
        using provider: any ConversationBridgeProviding,
        conversationId: String,
        viewerId: String,
        unreadCount: Int
    ) async -> ConversationBridge? {
        await provider.bridgeFor(conversationId: conversationId, viewerId: viewerId, unreadCount: unreadCount)
    }

    private func makeExpectedBridge() -> ConversationBridge {
        ConversationBridge(
            kind: .fallback,
            unreadCount: 4,
            suggestedMode: .focal,
            isComplete: nil,
            data: ConversationBridgeData(authors: ["Ali"], extraAuthorCount: 0, messageCount: 2)
        )
    }

    func test_bridgeProviding_localAndGatewayStub_sameInputs_produceEqualBridge() async {
        let expected = makeExpectedBridge()
        let local = LocalBridgeProvider(
            getCachedMessages: { _ in
                [
                    LentilleBridgeFormatter.BridgeMessage(senderId: "u2", senderName: "Ali", attachments: nil),
                    LentilleBridgeFormatter.BridgeMessage(senderId: "u2", senderName: "Ali", attachments: nil),
                ]
            },
            getUnreadWindow: { _ in .init(isComplete: true) }
        )
        let gateway = StubGatewayBridgeProvider(fixedBridge: expected)

        let localResult = await resolveBridge(using: local, conversationId: "c1", viewerId: "me", unreadCount: 4)
        let gatewayResult = await resolveBridge(using: gateway, conversationId: "c1", viewerId: "me", unreadCount: 4)

        XCTAssertEqual(localResult, expected)
        XCTAssertEqual(gatewayResult, expected)
        XCTAssertEqual(
            localResult, gatewayResult,
            "deux implémentations du même protocole, données égales ⇒ objets égaux"
        )
    }

    func test_bridgeProviding_injectionSwitch_observableResultIsIdentical() async {
        let bridge = makeExpectedBridge()
        let beforeSwitch: any ConversationBridgeProviding = StubGatewayBridgeProvider(fixedBridge: bridge)
        let afterSwitch: any ConversationBridgeProviding = LocalBridgeProvider(
            getCachedMessages: { _ in
                [
                    LentilleBridgeFormatter.BridgeMessage(senderId: "u2", senderName: "Ali", attachments: nil),
                    LentilleBridgeFormatter.BridgeMessage(senderId: "u2", senderName: "Ali", attachments: nil),
                ]
            },
            getUnreadWindow: { _ in .init(isComplete: true) }
        )

        let before = await resolveBridge(using: beforeSwitch, conversationId: "c1", viewerId: "me", unreadCount: 4)
        let after = await resolveBridge(using: afterSwitch, conversationId: "c1", viewerId: "me", unreadCount: 4)

        XCTAssertEqual(before, after, "la bascule d'injection ne doit rien changer d'observable")
    }

    func test_bridgeProviding_bothNil_remainsEqual() async {
        let local = LocalBridgeProvider(getCachedMessages: { _ in [] }, getUnreadWindow: { _ in nil })
        let gateway = StubGatewayBridgeProvider(fixedBridge: nil)

        let localResult = await resolveBridge(using: local, conversationId: "c1", viewerId: "me", unreadCount: 4)
        let gatewayResult = await resolveBridge(using: gateway, conversationId: "c1", viewerId: "me", unreadCount: 4)

        XCTAssertNil(localResult)
        XCTAssertNil(gatewayResult)
        XCTAssertEqual(localResult, gatewayResult)
    }

    // MARK: - ReadingModePreferenceStoring

    /// Double de test minimal, en mémoire — pas la véritable implémentation
    /// serveur (LWS-3, hors périmètre de M-048).
    private final class StubReadingModePreferenceStore: ReadingModePreferenceStoring, @unchecked Sendable {
        private var storage: [String: ReadingModePreference] = [:]

        func get(conversationId: String) async -> ReadingModePreference {
            storage[conversationId] ?? .auto
        }

        func set(conversationId: String, value: ReadingModePreference, optimistic: Bool = true) async {
            storage[conversationId] = value
        }

        func onChange(_ callback: @escaping @Sendable (String, ReadingModePreference) -> Void) -> @Sendable () -> Void {
            {}
        }
    }

    private func withIsolatedDefaults(_ body: (UserDefaults) async -> Void) async {
        let suiteName = "ProviderSubstitutionTests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        await body(defaults)
        defaults.removePersistentDomain(forName: suiteName)
    }

    func test_readingModeStoring_localAndStub_sameWrite_producesEqualRead() async {
        await withIsolatedDefaults { defaults in
            let local: any ReadingModePreferenceStoring = LocalReadingModePreferenceStore(defaults: defaults)
            let stub: any ReadingModePreferenceStoring = StubReadingModePreferenceStore()

            await local.set(conversationId: "c1", value: .script, optimistic: true)
            await stub.set(conversationId: "c1", value: .script, optimistic: true)

            let localValue = await local.get(conversationId: "c1")
            let stubValue = await stub.get(conversationId: "c1")

            XCTAssertEqual(localValue, .script)
            XCTAssertEqual(localValue, stubValue)
        }
    }

    func test_readingModeStoring_bothImplementations_unknownConversationDefaultsToAuto() async {
        await withIsolatedDefaults { defaults in
            let local: any ReadingModePreferenceStoring = LocalReadingModePreferenceStore(defaults: defaults)
            let stub: any ReadingModePreferenceStoring = StubReadingModePreferenceStore()

            let localValue = await local.get(conversationId: "never-set")
            let stubValue = await stub.get(conversationId: "never-set")

            XCTAssertEqual(localValue, .auto)
            XCTAssertEqual(stubValue, .auto)
        }
    }

    // MARK: - ConversationLiveCallProviding

    private final class StubLiveCallProvider: ConversationLiveCallProviding, @unchecked Sendable {
        private let fixedCall: ConversationLiveCall?

        init(fixedCall: ConversationLiveCall?) {
            self.fixedCall = fixedCall
        }

        func liveCallFor(conversationId: String) -> ConversationLiveCall? {
            fixedCall
        }

        func onChange(_ callback: @escaping @Sendable (String, ConversationLiveCall?) -> Void) -> @Sendable () -> Void {
            {}
        }
    }

    func test_liveCallProviding_localAndStub_sameState_produceEqualResult() {
        let call = ConversationLiveCall(voices: 2, startedAt: Date(timeIntervalSince1970: 1_700_000_000), joined: false)
        let local = LocalLiveCallProvider()
        local.noteLiveCall(call, for: "c1")
        let stub = StubLiveCallProvider(fixedCall: call)

        let localResult: any ConversationLiveCallProviding = local
        let stubResult: any ConversationLiveCallProviding = stub

        XCTAssertEqual(localResult.liveCallFor(conversationId: "c1"), stubResult.liveCallFor(conversationId: "c1"))
    }

    func test_liveCallProviding_bothImplementations_unknownConversationIsNil() {
        let local: any ConversationLiveCallProviding = LocalLiveCallProvider()
        let stub: any ConversationLiveCallProviding = StubLiveCallProvider(fixedCall: nil)

        XCTAssertNil(local.liveCallFor(conversationId: "never-noted"))
        XCTAssertNil(stub.liveCallFor(conversationId: "never-noted"))
    }
}
