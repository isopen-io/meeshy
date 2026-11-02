import XCTest
import MeeshySDK
@testable import Meeshy

/// Les réglages qu'une fiche de lien propose (#13938) suivent ce que le CERCLE ouvre (spec § 1.3, § 1.5) : le Bring
/// dès Ami — disponible par défaut, donc réglé par un BLOCAGE (D-3) —, le talkie et l'écoute dès Proche, la position
/// continue au Sang seulement. Une Connaissance n'a rien à régler.
final class CirclePersonSettingsTests: XCTestCase {

    func test_anAcquaintance_hasNothingToSet() {
        XCTAssertEqual(CirclePersonSetting.offered(at: .acquaintance), [])
    }

    func test_aFriend_canOnlyBlockTheirBring() {
        XCTAssertEqual(CirclePersonSetting.offered(at: .friend), [.blockBring])
    }

    func test_aClose_addsTheTalkieAndTheListening() {
        XCTAssertEqual(CirclePersonSetting.offered(at: .close), [.blockBring, .talkie, .listening])
    }

    func test_aBlood_addsTheLiveLocation() {
        XCTAssertEqual(CirclePersonSetting.offered(at: .blood), [.blockBring, .talkie, .listening, .liveLocation])
    }

    func test_belowAcquaintance_nothingIsOffered() {
        XCTAssertEqual(CirclePersonSetting.offered(at: .community), [])
        XCTAssertEqual(CirclePersonSetting.offered(at: .public), [])
    }

    func test_everyOfferedSetting_isNamed() {
        let named = CirclePersonSetting.allCases.map(\.title)
        XCTAssertFalse(named.contains(where: \.isEmpty))
        XCTAssertEqual(Set(named).count, CirclePersonSetting.allCases.count)
    }
}

/// La personne d'un lien porte le contour d'avatar servi avec elle (#10945) : l'écran ne le fabrique pas, il le relaie.
final class CirclePersonRingTests: XCTestCase {

    func test_aPersonNamedFromTheirProfile_carriesTheServedRing() {
        let ring = ServedProfileDecorItem(pack: "rings", item: "gold", origin: .builtin)
        let user = MeeshyUser(id: "u1", username: "alice", displayName: "Alice", profileDecor: ServedProfileDecor(avatarRing: ring))

        XCTAssertEqual(CirclePerson(user: user).ring, ring)
    }

    func test_aPersonWithoutARing_hasNone() {
        let user = MeeshyUser(id: "u1", username: "alice", displayName: "Alice")

        XCTAssertNil(CirclePerson(user: user).ring)
    }
}
