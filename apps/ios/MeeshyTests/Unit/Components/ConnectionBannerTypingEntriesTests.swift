import XCTest
import MeeshySDK
@testable import Meeshy

/// Quelqu'un vous écrit dans une conversation que vous n'avez PAS sous les
/// yeux : rien ne le disait tant qu'on ne revenait pas à la liste. La pastille
/// de synchronisation le porte désormais — `@pseudo` + points animés, tap pour
/// ouvrir la conversation.
///
/// La conversation OUVERTE en est exclue : son propre indicateur de frappe est
/// déjà à l'écran, le doubler en haut serait du bruit.
@MainActor
final class ConnectionBannerTypingEntriesTests: XCTestCase {

    private func entries(
        _ typingUsers: [String: String],
        excluding activeId: String? = nil
    ) -> [SyncPillEntry] {
        ConnectionBanner.typingEntries(typingUsers: typingUsers, excluding: activeId)
    }

    func test_typingEntries_surfacesTheHandleWithActivityDotsAndAConversationTarget() throws {
        let result = entries(["conv1": "alice"])

        XCTAssertEqual(result.count, 1)
        let entry = try XCTUnwrap(result.first)
        XCTAssertEqual(entry.id, "typing.conv1")
        XCTAssertEqual(entry.label, "@alice")
        XCTAssertEqual(entry.dotStyle, SyncPillDotStyle.brand)
        XCTAssertTrue(entry.showsActivityDots,
                      "quelqu'un est en train d'écrire : l'entrée doit se lire comme en cours")
        XCTAssertEqual(entry.source, OutboxUIItem.Source.conversation(id: "conv1"),
                       "le tap doit ouvrir la conversation où l'on écrit")
    }

    func test_typingEntries_excludesTheOpenConversation() {
        let result = entries(["conv1": "alice"], excluding: "conv1")

        XCTAssertTrue(result.isEmpty,
                      "la conversation à l'écran a déjà son indicateur de frappe")
    }

    func test_typingEntries_yieldsOneStableEntryPerConversation() {
        let result = entries(["conv-b": "bob", "conv-a": "alice", "conv-c": "carol"])

        XCTAssertEqual(result.map(\.id), ["typing.conv-a", "typing.conv-b", "typing.conv-c"],
                       "l'ordre doit être stable, sinon la rotation saute d'une entrée à l'autre")
        XCTAssertEqual(result.map(\.label), ["@alice", "@bob", "@carol"])
    }

    func test_typingEntries_withoutTypers_isEmpty() {
        XCTAssertTrue(entries([:]).isEmpty)
        XCTAssertTrue(entries([:], excluding: "conv1").isEmpty)
    }

    // MARK: - Remontée de la pastille

    /// La pastille naissait trop bas sous le chrome de ses hôtes. Elle remonte
    /// de trois fois sa hauteur — en RENDANT de la marge, jamais en débordant :
    /// un hôte déjà collé en haut reste où il est.
    func test_liftedTopPadding_liftsByThreeTimesThePillHeight() {
        XCTAssertEqual(
            ConnectionBanner.liftedTopPadding(base: 72),
            72 - SyncPillMetrics.topLift,
            "72 pt sous le header de conversation : la marge disponible est rendue"
        )
        XCTAssertEqual(SyncPillMetrics.topLift, 3 * SyncPillMetrics.height,
                       "la remontée est exprimée en hauteurs de pastille, pas en points en dur")
    }

    func test_liftedTopPadding_neverPushesAboveTheTopOfItsHost() {
        XCTAssertEqual(ConnectionBanner.liftedTopPadding(base: 0), 0,
                       "un hôte sans marge (iPad) ne doit pas voir la pastille passer sous la barre d'état")
        XCTAssertEqual(ConnectionBanner.liftedTopPadding(base: 8), 0,
                       "le viewer de story n'a que 8 pt : il les rend, et s'arrête là")
    }

}
