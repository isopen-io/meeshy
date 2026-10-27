import XCTest
import MeeshySDK
@testable import Meeshy

/// `GatewayBridgeProvider` (G-124, second des deux implémentations attendues
/// par `ConversationBridgeProviding`, LWS-2bis/M-048). Contrairement à
/// `LocalBridgeProvider` (calcule), ce type RELAIE : un registre en mémoire,
/// nourri par `note`/`noteBridges(from:)`, jamais un appel réseau propre.
///
/// Trois garanties verrouillées ici :
/// - rien de connu ⇒ `nil` (zéro donnée fabriquée, même discipline que
///   `LocalBridgeProvider`/`LocalLiveCallProvider`).
/// - un pont noté est rendu SANS transformation — `suggestedMode`/
///   `isComplete`/`data` traversent tels quels (le provider ne recalcule
///   jamais, contrairement au substitut).
/// - `note(nil, for:)` efface une entrée déjà connue (le pont peut redevenir
///   absent — `unreadCount` retombé à zéro — et le registre doit suivre,
///   pas garder un pont périmé).
final class GatewayBridgeProviderTests: XCTestCase {

    private func makeBridge(unreadCount: Int = 4, isComplete: Bool? = nil) -> ConversationBridge {
        ConversationBridge(
            kind: .fallback,
            unreadCount: unreadCount,
            suggestedMode: .focal,
            isComplete: isComplete,
            data: ConversationBridgeData(authors: ["Ali"], extraAuthorCount: 1, messageCount: 3)
        )
    }

    // MARK: - Rien de connu

    func test_bridgeFor_unknownConversation_returnsNil() async {
        let sut = GatewayBridgeProvider()

        let bridge = await sut.bridgeFor(conversationId: "never-noted", viewerId: "me", unreadCount: 4)

        XCTAssertNil(bridge, "aucune donnée notée ⇒ nil, jamais un pont inventé")
    }

    // MARK: - Relais sans transformation

    func test_bridgeFor_afterNote_returnsExactSameBridge_noTransformation() async {
        let sut = GatewayBridgeProvider()
        let bridge = makeBridge(unreadCount: 4, isComplete: false)

        sut.note(bridge, for: "c1")
        let resolved = await sut.bridgeFor(conversationId: "c1", viewerId: "me", unreadCount: 4)

        XCTAssertEqual(resolved, bridge, "un relais ne recalcule rien — objet noté == objet rendu")
        XCTAssertEqual(resolved?.isComplete, false, "isComplete traverse SANS transformation")
        XCTAssertEqual(resolved?.suggestedMode, .focal, "suggestedMode traverse SANS transformation")
    }

    func test_bridgeFor_isCompleteAbsent_staysNilNotCoercedToTrue() async {
        let sut = GatewayBridgeProvider()
        let bridge = makeBridge(isComplete: nil)

        sut.note(bridge, for: "c1")
        let resolved = await sut.bridgeFor(conversationId: "c1", viewerId: "me", unreadCount: 4)

        XCTAssertNil(resolved?.isComplete, "absent = complet — jamais réécrit en `true` explicite par le relais")
    }

    func test_bridgeFor_ignoresRequestedUnreadCountMismatch_stillRelaysRegisteredBridge() async {
        // Le provider ne valide pas viewerId/unreadCount contre le pont noté —
        // « JAMAIS de requête réseau propre : il relaie ce que la couche
        // conversations a déjà » (LentilleProviders.swift, en-tête
        // `GatewayBridgeProvider`). Ce n'est pas un bug : la fraîcheur est la
        // responsabilité du point de composition qui alimente le registre
        // (`noteBridges(from:)`), pas de ce relais.
        let sut = GatewayBridgeProvider()
        let bridge = makeBridge(unreadCount: 4)

        sut.note(bridge, for: "c1")
        let resolved = await sut.bridgeFor(conversationId: "c1", viewerId: "me", unreadCount: 999)

        XCTAssertEqual(resolved, bridge)
    }

    // MARK: - Conversations distinctes, registres indépendants

    func test_bridgeFor_multipleConversations_eachResolvesItsOwnBridge() async {
        let sut = GatewayBridgeProvider()
        let bridgeA = makeBridge(unreadCount: 2)
        let bridgeB = makeBridge(unreadCount: 9)

        sut.note(bridgeA, for: "a")
        sut.note(bridgeB, for: "b")

        let resolvedA = await sut.bridgeFor(conversationId: "a", viewerId: "me", unreadCount: 2)
        let resolvedB = await sut.bridgeFor(conversationId: "b", viewerId: "me", unreadCount: 9)

        XCTAssertEqual(resolvedA, bridgeA)
        XCTAssertEqual(resolvedB, bridgeB)
    }

    // MARK: - Effacement

    func test_note_nilBridge_clearsPreviouslyKnownEntry() async {
        let sut = GatewayBridgeProvider()
        sut.note(makeBridge(), for: "c1")

        sut.note(nil, for: "c1")
        let resolved = await sut.bridgeFor(conversationId: "c1", viewerId: "me", unreadCount: 4)

        XCTAssertNil(resolved, "un pont redevenu absent doit disparaître du registre, jamais rester périmé")
    }

    func test_note_overwritesPreviousBridge_forSameConversation() async {
        let sut = GatewayBridgeProvider()
        sut.note(makeBridge(unreadCount: 2), for: "c1")

        sut.note(makeBridge(unreadCount: 9), for: "c1")
        let resolved = await sut.bridgeFor(conversationId: "c1", viewerId: "me", unreadCount: 9)

        XCTAssertEqual(resolved?.unreadCount, 9, "la dernière notification gagne, jamais un empilement")
    }

    // MARK: - noteBridges(from:) — alimentation en lot depuis un instantané de liste

    func test_noteBridges_populatesFromConversationsCarryingABridge() async {
        let sut = GatewayBridgeProvider()
        var withBridge = MeeshyConversation(identifier: "id-1", unreadCount: 4)
        withBridge.bridge = makeBridge(unreadCount: 4)
        let withoutBridge = MeeshyConversation(identifier: "id-2", unreadCount: 0)

        sut.noteBridges(from: [withBridge, withoutBridge])

        let resolvedWith = await sut.bridgeFor(conversationId: withBridge.id, viewerId: "me", unreadCount: 4)
        let resolvedWithout = await sut.bridgeFor(conversationId: withoutBridge.id, viewerId: "me", unreadCount: 0)

        XCTAssertEqual(resolvedWith, withBridge.bridge)
        XCTAssertNil(resolvedWithout, "conversation sans bridge ⇒ rien noté, jamais un pont vide fabriqué")
    }

    func test_noteBridges_conversationBridgeBecomingNil_clearsThePreviouslyNotedEntry() async {
        // Deux instantanés successifs de LA MÊME conversation, comme le
        // composition root (`ConversationListViewModel.conversations`,
        // `didSet`) les fournirait au fil du temps : d'abord un pont non lu,
        // puis — la conversation ayant été lue — plus de pont du tout.
        let sut = GatewayBridgeProvider()
        var firstSnapshot = MeeshyConversation(id: "c1", identifier: "id-1", unreadCount: 4)
        firstSnapshot.bridge = makeBridge(unreadCount: 4)
        sut.noteBridges(from: [firstSnapshot])

        var secondSnapshot = MeeshyConversation(id: "c1", identifier: "id-1", unreadCount: 0)
        secondSnapshot.bridge = nil
        sut.noteBridges(from: [secondSnapshot])

        let resolved = await sut.bridgeFor(conversationId: "c1", viewerId: "me", unreadCount: 0)

        XCTAssertNil(resolved, "un instantané plus récent sans pont doit purger l'ancien, pas le laisser périmé")
    }
}
