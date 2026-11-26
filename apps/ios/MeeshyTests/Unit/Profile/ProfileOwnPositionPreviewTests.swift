import XCTest
import MeeshySDK
@testable import Meeshy

/// « Ma position » montre une vraie carte avant tout toucher (#20199) : la carte seulement quand ma position PART et que
/// l'appareil la connaît déjà (cache, jamais une attente) ; sinon la rangée le dit, sans carte vide. Sur la carte, la
/// feuille d'une personne n'offre que les gestes permis.
@MainActor
final class ProfileOwnPositionPreviewTests: XCTestCase {

    private func fix() -> SharedLocationFix {
        SharedLocationFix(latitude: 48.8566, longitude: 2.3522, accuracy: 12)!
    }

    func test_resolve_sharedWithAKnownFix_showsTheMap() {
        XCTAssertEqual(ProfileOwnPositionPreview.resolve(recipients: 2, isGhost: false, fix: fix(), at: nil), .map(fix(), at: nil))
    }

    func test_resolve_notShared_saysItWithoutAMap() {
        XCTAssertEqual(ProfileOwnPositionPreview.resolve(recipients: 0, isGhost: false, fix: fix(), at: nil), .note)
    }

    func test_resolve_ghost_hidesTheMapEvenWhenShared() {
        XCTAssertEqual(ProfileOwnPositionPreview.resolve(recipients: 3, isGhost: true, fix: fix(), at: nil), .note)
    }

    func test_resolve_sharedButNoKnownFix_neverDrawsAnEmptyMap() {
        XCTAssertEqual(ProfileOwnPositionPreview.resolve(recipients: 1, isGhost: false, fix: nil, at: nil), .note)
    }

    func test_talkie_isOfferedFromCloseOnly() {
        XCTAssertFalse(PersonLocationCard.offersTalkie(nil))
        XCTAssertFalse(PersonLocationCard.offersTalkie(.friend))
        XCTAssertTrue(PersonLocationCard.offersTalkie(.close))
        XCTAssertTrue(PersonLocationCard.offersTalkie(.blood))
    }

    // MARK: - Depuis « Ma carte », la feuille d'une personne offre Écrire et Appeler

    private final class ReachSpy {
        var written: [String] = []
        var called: [ProfileCallRequest] = []
    }

    private func reach(_ spy: ReachSpy, me: String? = "me") -> PersonMapReach {
        PersonMapReach(write: { spy.written.append($0) }, call: { spy.called.append($0) }, currentUserId: { me })
    }

    func test_reach_otherPerson_offersWriteToTheirDirect() async throws {
        let spy = ReachSpy()
        let write = try XCTUnwrap(reach(spy).onWrite(userId: "lina"))
        write()
        await Task.yield()
        await Task.yield()
        XCTAssertEqual(spy.written, ["lina"])
    }

    func test_reach_otherPerson_offersAnAudioCallToThem() throws {
        let spy = ReachSpy()
        let call = try XCTUnwrap(reach(spy).onCall(userId: "lina", displayName: "Lina"))
        call()
        XCTAssertEqual(spy.called, [ProfileCallRequest(userId: "lina", displayName: "Lina", isVideo: false, conversationId: nil)])
    }

    func test_reach_myselfOrNobody_offersNothing() {
        let spy = ReachSpy()
        XCTAssertNil(reach(spy).onWrite(userId: "me"))
        XCTAssertNil(reach(spy).onCall(userId: "me", displayName: "Moi"))
        XCTAssertNil(reach(spy).onWrite(userId: ""))
        XCTAssertNil(reach(spy, me: nil).onCall(userId: "lina", displayName: "Lina"))
    }

    func test_nearbyMap_wiresWriteAndCallIntoThePersonMap() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/SharedLocation/Map/NearbyMapScreen.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(source.contains("onWrite: leaving(reach.onWrite(userId: person.userId))"))
        XCTAssertTrue(source.contains("onCall: leaving(reach.onCall(userId: person.userId, displayName: person.name))"))
    }
}
