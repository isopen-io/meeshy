import XCTest
import MeeshySDK
@testable import Meeshy

/// `LocalBridgeProvider` (LWS-2bis, M-048) — le substitut client du pont ✦.
///
/// Trois sémantiques verrouillées ici, mêmes garanties que le miroir TS
/// (M-047) :
/// - fenêtre INCONNUE (`getUnreadWindow` → `nil`) ⇒ `bridgeFor` rend `nil` —
///   rien à annoncer plutôt qu'une supposition.
/// - fenêtre INCOMPLÈTE (`isComplete: false`) ⇒ le pont rendu porte
///   `isComplete == false` — jamais un décompte extrapolé.
/// - fenêtre COMPLÈTE ⇒ `isComplete == nil` (absent = complet, REV-1 blocage 6).
///
/// Plus le seuil `suggestedMode` (≤ 25 → `.focal`, > 25 → `.resume`),
/// doublon documenté de `ORCHESTRATOR_UNREAD_CAP`
/// (`packages/shared/utils/reading-modes.ts`) en attendant le miroir Swift
/// `ReadingModeOrchestrator` (M-042).
///
/// **Hypothèse d'intégration** (voir `LentilleProviders.swift`) : ces témoins
/// supposent `LentilleBridgeFormatter.BridgeMessage(senderId:senderName:attachments:)`
/// nichée dans `LentilleBridgeFormatter` (M-041, tourne en parallèle de
/// cette tâche). Si la forme réelle diffère, Fable réconcilie ces fixtures.
final class LocalBridgeProviderTests: XCTestCase {

    // MARK: - Fabriques

    private func makeMessage(senderId: String, senderName: String) -> LentilleBridgeFormatter.BridgeMessage {
        LentilleBridgeFormatter.BridgeMessage(senderId: senderId, senderName: senderName, attachments: nil)
    }

    /// Deux messages d'un même auteur AUTRE que le lecteur — jamais vide,
    /// jamais uniquement les messages du lecteur (sinon `buildBridgeData`
    /// rend `nil` par construction, LWS-1, et masquerait ce que ce fichier
    /// teste réellement : la fenêtre, pas la loi de données elle-même).
    private func makeMessagesFromOthers() -> [LentilleBridgeFormatter.BridgeMessage] {
        [makeMessage(senderId: "u2", senderName: "Ali"), makeMessage(senderId: "u2", senderName: "Ali")]
    }

    private func makeSUT(
        messages: [LentilleBridgeFormatter.BridgeMessage],
        window: LocalBridgeProvider.UnreadWindow?
    ) -> LocalBridgeProvider {
        LocalBridgeProvider(
            getCachedMessages: { _ in messages },
            getUnreadWindow: { _ in window }
        )
    }

    // MARK: - Fenêtre inconnue

    func test_bridgeFor_unknownWindow_returnsNil() async {
        let sut = makeSUT(messages: makeMessagesFromOthers(), window: nil)

        let bridge = await sut.bridgeFor(conversationId: "c1", viewerId: "me", unreadCount: 4)

        XCTAssertNil(bridge, "une fenêtre inconnue n'a rien à annoncer — jamais une supposition")
    }

    /// Compteur thread-safe — un `var` local mutable capturé par une closure
    /// `@Sendable` ne compile pas en Swift 6 (concurrence stricte) ; ce
    /// double protège son compteur par verrou, même patron que
    /// `LentilleScopedReadingModePreferenceStore`/`LocalLiveCallProvider`.
    private final class CallCounter: @unchecked Sendable {
        private let lock = NSLock()
        private(set) var count = 0
        func increment() {
            lock.lock()
            count += 1
            lock.unlock()
        }
    }

    func test_bridgeFor_unknownWindow_doesNotEvenReadCachedMessages() async {
        let counter = CallCounter()
        let sut = LocalBridgeProvider(
            getCachedMessages: { _ in
                counter.increment()
                return []
            },
            getUnreadWindow: { _ in nil }
        )

        _ = await sut.bridgeFor(conversationId: "c1", viewerId: "me", unreadCount: 4)

        XCTAssertEqual(counter.count, 0, "fenêtre inconnue ⇒ court-circuit avant toute lecture du cache")
    }

    // MARK: - Fenêtre complète / incomplète

    func test_bridgeFor_completeWindow_isCompleteIsNil() async {
        let sut = makeSUT(messages: makeMessagesFromOthers(), window: .init(isComplete: true))

        let bridge = await sut.bridgeFor(conversationId: "c1", viewerId: "me", unreadCount: 4)

        XCTAssertNil(bridge?.isComplete, "absent = complet (REV-1 blocage 6), jamais `true` explicite")
    }

    func test_bridgeFor_incompleteWindow_isCompleteIsFalse() async {
        let sut = makeSUT(messages: makeMessagesFromOthers(), window: .init(isComplete: false))

        let bridge = await sut.bridgeFor(conversationId: "c1", viewerId: "me", unreadCount: 4)

        XCTAssertEqual(bridge?.isComplete, false, "fenêtre bornée au cache ⇒ partialité déclarée SUR le pont")
    }

    // MARK: - Zéro non-lu / rien à annoncer (repli sur LWS-1)

    func test_bridgeFor_zeroUnreadCount_returnsNil() async {
        let sut = makeSUT(messages: makeMessagesFromOthers(), window: .init(isComplete: true))

        let bridge = await sut.bridgeFor(conversationId: "c1", viewerId: "me", unreadCount: 0)

        XCTAssertNil(bridge, "zéro non-lu ⇒ nil, jamais un pont vide (critère LWS-1)")
    }

    func test_bridgeFor_onlyViewerOwnMessages_returnsNil() async {
        let sut = makeSUT(
            messages: [makeMessage(senderId: "me", senderName: "Moi")],
            window: .init(isComplete: true)
        )

        let bridge = await sut.bridgeFor(conversationId: "c1", viewerId: "me", unreadCount: 3)

        XCTAssertNil(bridge, "rien à annoncer quand la fenêtre ne contient que les messages du lecteur")
    }

    // MARK: - Champs du pont

    func test_bridgeFor_populatesFallbackKindAndData() async {
        let sut = makeSUT(messages: makeMessagesFromOthers(), window: .init(isComplete: true))

        let bridge = await sut.bridgeFor(conversationId: "c1", viewerId: "me", unreadCount: 4)

        XCTAssertEqual(bridge?.kind, .fallback, "le substitut client ne produit jamais l'étage `agent`")
        XCTAssertEqual(bridge?.unreadCount, 4)
        XCTAssertEqual(bridge?.data?.authors, ["Ali"])
        XCTAssertEqual(bridge?.data?.messageCount, 2)
    }

    // MARK: - Seuil suggestedMode — 25 / 26 (miroir de ORCHESTRATOR_UNREAD_CAP)

    func test_bridgeFor_unreadCountAtCap25_suggestsFocal() async {
        let sut = makeSUT(messages: makeMessagesFromOthers(), window: .init(isComplete: true))

        let bridge = await sut.bridgeFor(conversationId: "c1", viewerId: "me", unreadCount: 25)

        XCTAssertEqual(bridge?.suggestedMode, .focal, "≤ 25 ⇒ Focal + pont ✦")
    }

    func test_bridgeFor_unreadCountOverCap26_suggestsResume() async {
        let sut = makeSUT(messages: makeMessagesFromOthers(), window: .init(isComplete: true))

        let bridge = await sut.bridgeFor(conversationId: "c1", viewerId: "me", unreadCount: 26)

        XCTAssertEqual(bridge?.suggestedMode, .resume, "> 25 ⇒ Résumé Vivant")
    }

    // MARK: - Compteur du protocole autoritatif (REV-2, blocker 1 — parité TS)

    /// Cas discriminant : le compteur APPELANT (30) diverge de la couverture
    /// du cache (2 messages). Le pont doit porter le compteur du protocole —
    /// gate, champ `unreadCount` ET `suggestedMode` — jamais un compte dérivé
    /// du cache. Témoin jumeau du test TS de `local-bridge-provider.test.ts` :
    /// c'est l'absence de CE cas des deux côtés qui a laissé le miroir TS
    /// lire un second compteur pendant que Swift lisait le bon.
    func test_bridgeFor_callerCountDivergesFromCacheCoverage_protocolCountWins() async {
        let sut = makeSUT(messages: makeMessagesFromOthers(), window: .init(isComplete: true))

        let bridge = await sut.bridgeFor(conversationId: "c1", viewerId: "me", unreadCount: 30)

        XCTAssertEqual(bridge?.unreadCount, 30, "le compteur du protocole prime la couverture du cache")
        XCTAssertEqual(bridge?.suggestedMode, .resume, "30 > 25 ⇒ résumé, même si le cache ne couvre que 2 messages")
        XCTAssertEqual(bridge?.data?.messageCount, 2, "la data, elle, reste celle de la fenêtre en cache")
    }

    func test_suggestedMode_pureFunction_matchesCapBoundary() {
        XCTAssertEqual(LocalBridgeProvider.suggestedMode(forUnreadCount: 1), .focal)
        XCTAssertEqual(LocalBridgeProvider.suggestedMode(forUnreadCount: 25), .focal)
        XCTAssertEqual(LocalBridgeProvider.suggestedMode(forUnreadCount: 26), .resume)
        XCTAssertEqual(LocalBridgeProvider.suggestedMode(forUnreadCount: 200), .resume)
    }
}
