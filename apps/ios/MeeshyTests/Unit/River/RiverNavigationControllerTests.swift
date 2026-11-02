import XCTest
@testable import Meeshy

/// `RiverNavigationController` — le CONTRÔLEUR, pas la loi : `RiverLaneVectorTests`
/// (R-132) prouve déjà `resolveRiverStep` vecteur par vecteur. Cette suite
/// prouve que le contrôleur (1) délègue CHAQUE pas sans jamais recalculer,
/// (2) tient le curseur/la raison à jour, (3) incrémente `edgeBounceToken`
/// UNIQUEMENT sur `.edge`, et (4) que `moveTo` est un choix explicite, pas
/// un pas de loi.
@MainActor
final class RiverNavigationControllerTests: XCTestCase {

    // MARK: - Fixture : 3 voix, aucune réponse, un rang par message

    /// u1 (le lecteur) est à la rive (couloir 0), u2 et u3 arrivent ensuite
    /// dans l'ordre de naissance (couloirs 1 et 2) — `orderLaneIds`. 3 voix
    /// ≥ `RIVER_MIN_VOICES` (3) et 3 couloirs ≤ `RIVER_MAX_LANES` (7) :
    /// `layout == .lanes`, jamais sérialisée.
    private func makeGeometry() -> RiverLaneResolver.RiverGeometry {
        let messages: [RiverLaneResolver.RiverMessageInput] = [
            .init(id: "m0", senderId: "u1", createdAt: .epochMilliseconds(0)),
            .init(id: "m1", senderId: "u2", createdAt: .epochMilliseconds(1000)),
            .init(id: "m2", senderId: "u3", createdAt: .epochMilliseconds(2000)),
            .init(id: "m3", senderId: "u1", createdAt: .epochMilliseconds(3000)),
            .init(id: "m4", senderId: "u2", createdAt: .epochMilliseconds(4000)),
            .init(id: "m5", senderId: "u3", createdAt: .epochMilliseconds(5000)),
        ]
        let participants: [RiverLaneResolver.RiverParticipantInput] = [
            .init(id: "u1", displayName: "Toi"),
            .init(id: "u2", displayName: "Bob"),
            .init(id: "u3", displayName: "Carol"),
        ]
        return RiverLaneResolver.resolveRiverLanes(
            .init(messages: messages, participants: participants, viewerId: "u1")
        )
    }

    private func makeController(cursor: RiverLaneResolver.RiverCursor) -> RiverNavigationController {
        RiverNavigationController(geometry: makeGeometry(), initialCursor: cursor)
    }

    // MARK: - Décor — la fixture forme bien une rivière à trois couloirs

    func test_fixture_isLanesNotSerialized() {
        let geometry = makeGeometry()
        XCTAssertEqual(geometry.layout, .lanes, "Décor : 3 voix/3 couloirs doit rester .lanes pour discriminer left/right.")
        XCTAssertEqual(geometry.voiceCount, 3)
        XCTAssertEqual(geometry.laneCount, 3)
    }

    // MARK: - État initial

    func test_init_setsCursorAndNilReason() {
        let controller = makeController(cursor: .init(laneIndex: 0, rank: 0))
        XCTAssertEqual(controller.cursor, .init(laneIndex: 0, rank: 0))
        XCTAssertNil(controller.lastReason)
        XCTAssertEqual(controller.edgeBounceToken, 0)
    }

    // MARK: - `.edge` — le curseur ne bouge pas, le jeton avance

    /// Au rang 0, seul le couloir 0 (u1) est vivant — aucune branche à
    /// droite : `.right` bute.
    func test_step_right_atLeadingEdge_staysPut_incrementsBounceToken() {
        let controller = makeController(cursor: .init(laneIndex: 0, rank: 0))

        controller.step(.right)

        XCTAssertEqual(controller.cursor, .init(laneIndex: 0, rank: 0))
        XCTAssertEqual(controller.lastReason, .edge)
        XCTAssertEqual(controller.edgeBounceToken, 1)
    }

    func test_step_edge_repeated_incrementsTokenEachTime() {
        let controller = makeController(cursor: .init(laneIndex: 0, rank: 0))

        controller.step(.right)
        controller.step(.right)
        controller.step(.right)

        XCTAssertEqual(controller.edgeBounceToken, 3)
    }

    // MARK: - `.moved` — suivre une personne (axe vertical, § « Suivre Mia »)

    /// u2 n'a que deux messages, aux rangs 1 et 4 — `.down` depuis 1 saute
    /// PAR-DESSUS les rangs 2/3 (d'autres branches) jusqu'au 4.
    func test_step_down_followsSamePersonAcrossOthersBubbles() {
        let controller = makeController(cursor: .init(laneIndex: 1, rank: 1))

        controller.step(.down)

        XCTAssertEqual(controller.cursor, .init(laneIndex: 1, rank: 4))
        XCTAssertEqual(controller.lastReason, .moved)
        XCTAssertEqual(controller.edgeBounceToken, 0, "un pas qui bouge ne compte jamais comme un bord")
    }

    func test_step_up_thenEdge_atFirstBubbleOfLane() {
        let controller = makeController(cursor: .init(laneIndex: 1, rank: 4))

        controller.step(.up)
        XCTAssertEqual(controller.cursor, .init(laneIndex: 1, rank: 1), "revient au premier message de u2")
        XCTAssertEqual(controller.lastReason, .moved)

        controller.step(.up)
        XCTAssertEqual(controller.cursor, .init(laneIndex: 1, rank: 1), "aucun message plus ancien de u2 — bord")
        XCTAssertEqual(controller.lastReason, .edge)
        XCTAssertEqual(controller.edgeBounceToken, 1)
    }

    // MARK: - `moveTo` — un choix explicite, PAS un pas de la loi

    func test_moveTo_setsCursorDirectly_withoutTouchingBounceToken() {
        let controller = makeController(cursor: .init(laneIndex: 0, rank: 0))
        controller.step(.right) // edgeBounceToken == 1

        controller.moveTo(.init(laneIndex: 2, rank: 2))

        XCTAssertEqual(controller.cursor, .init(laneIndex: 2, rank: 2))
        XCTAssertEqual(controller.lastReason, .moved)
        XCTAssertEqual(controller.edgeBounceToken, 1, "moveTo ne fait jamais avancer le jeton de rebond")
    }

    // MARK: - `updateGeometry` — le curseur SURVIT, la loi ne le recale jamais

    /// Géométrie vide (aucun message) : `resolveRiverLaneAt` ne trouve plus
    /// de branche au curseur reçu ⇒ `.empty`, curseur INCHANGÉ (§7bis : « la
    /// loi rend le curseur reçu plutôt que d'en inventer un »).
    func test_updateGeometry_thenStepOnStaleCursor_returnsEmpty_cursorUnchanged() {
        let controller = makeController(cursor: .init(laneIndex: 1, rank: 1))
        let emptyGeometry = RiverLaneResolver.resolveRiverLanes(
            .init(messages: [], participants: [], viewerId: "u1")
        )

        controller.updateGeometry(emptyGeometry)
        controller.step(.down)

        XCTAssertEqual(controller.cursor, .init(laneIndex: 1, rank: 1), "curseur reçu, jamais inventé")
        XCTAssertEqual(controller.lastReason, .empty)
        XCTAssertEqual(controller.edgeBounceToken, 0, "`.empty` n'est pas un rebond de bord")
    }
}
