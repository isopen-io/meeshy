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
        XCTAssertEqual(entry.source, OutboxUIItem.Source.conversation(id: "conv1", messageId: nil),
                       """
                       le tap doit ouvrir la conversation où l'on écrit — et SANS ancre \
                       de message (#4027) : « X écrit » ne désigne aucun message, il n'y \
                       en a pas encore. Viser ici ferait sauter le fil sur un id arbitraire.
                       """)
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
    /// de QUATRE fois sa hauteur — en RENDANT de la marge, jamais en débordant :
    /// un hôte déjà collé en haut reste où il est.
    ///
    /// **Ce témoin disait `3 ×` pendant que le code posait `4 ×`.** Les deux
    /// moitiés ont bougé dans le MÊME commit (`cf376fe114`), et seule la moitié
    /// production a suivi #4016 — dont le doc-comment nomme la valeur, sa
    /// raison (« JUSTE SOUS la Dynamic Island ») et le fait qu'elle AUGMENTE la
    /// précédente. Le témoin était donc la moitié périmée, et il faisait rougir
    /// le gate iOS entier pour tout le monde.
    ///
    /// Sa première assertion était fausse d'une seconde façon, plus
    /// intéressante : `72 - topLift` vaut `-16` à quatre hauteurs, or
    /// `liftedTopPadding` BORNE à `0`. Écrite comme une soustraction, elle
    /// n'exerçait la borne dans AUCUN des deux régimes — elle la contournait.
    /// Les deux cas sont désormais nommés séparément.
    func test_liftedTopPadding_liftsByFourTimesThePillHeight() {
        XCTAssertEqual(SyncPillMetrics.topLift, 4 * SyncPillMetrics.height,
                       "la remontée est exprimée en hauteurs de pastille, pas en points en dur (#4016)")

        XCTAssertEqual(
            ConnectionBanner.liftedTopPadding(base: 120),
            120 - SyncPillMetrics.topLift,
            "marge plus grande que la remontée : ce qui reste est rendu"
        )

        XCTAssertEqual(
            ConnectionBanner.liftedTopPadding(base: 72),
            0,
            "72 pt sous le header de conversation : la remontée les consomme TOUS, et la borne retient à 0 plutôt que de passer au-dessus"
        )
    }

    func test_liftedTopPadding_neverPushesAboveTheTopOfItsHost() {
        XCTAssertEqual(ConnectionBanner.liftedTopPadding(base: 0), 0,
                       "un hôte sans marge (iPad) ne doit pas voir la pastille passer sous la barre d'état")
        XCTAssertEqual(ConnectionBanner.liftedTopPadding(base: 8), 0,
                       "le viewer de story n'a que 8 pt : il les rend, et s'arrête là")
    }

}
