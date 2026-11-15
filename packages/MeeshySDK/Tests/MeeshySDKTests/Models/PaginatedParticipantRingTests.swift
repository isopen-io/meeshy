import XCTest
@testable import MeeshySDK

/// #10713 — la liste paginée des membres (`GET /conversations/:id/participants`) sert le contour
/// équipé de chaque membre ; le SDK le porte jusqu'à la ligne, additivement, et la repeinture
/// d'un pair (`user:updated`) ne l'efface pas.
final class PaginatedParticipantRingTests: XCTestCase {

    private func decode(_ json: String) throws -> PaginatedParticipant {
        try JSONDecoder().decode(PaginatedParticipant.self, from: Data(json.utf8))
    }

    func test_aMemberCarriesItsServedRing() throws {
        let member = try decode("""
        {"id":"p1","userId":"u1","profileDecor":{"avatarRing":{"pack":"contours-essentiels","item":"perle","origin":"builtin","contract":null}}}
        """)
        XCTAssertEqual(member.profileDecor?.avatarRing,
                       ServedProfileDecorItem(pack: "contours-essentiels", item: "perle", origin: .builtin))
    }

    func test_aMemberWithoutDecor_isTheRowOfBefore() throws {
        XCTAssertNil(try decode(#"{"id":"p1","userId":"u1"}"#).profileDecor)
    }

    func test_anUnreadableDecor_neverBreaksTheList() throws {
        let member = try decode(#"{"id":"p1","userId":"u1","profileDecor":"cassé"}"#)
        XCTAssertNil(member.profileDecor?.avatarRing)
    }

    func test_repaintingAPeer_keepsItsRing() throws {
        let ring = ServedProfileDecor(avatarRing: ServedProfileDecorItem(pack: "p", item: "i", origin: .builtin))
        let member = PaginatedParticipant(id: "p1", userId: "u1", username: "a", displayName: "A", profileDecor: ring)
        let event = try JSONDecoder().decode(
            UserUpdatedEvent.self,
            from: Data(#"{"userId":"u1","changes":{"displayName":null,"firstName":"Alice","lastName":"Roy","username":"alice"}}"#.utf8))

        XCTAssertEqual(event.repainted(member)?.profileDecor, ring)
    }
}
