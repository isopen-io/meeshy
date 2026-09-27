import XCTest
@testable import MeeshySDK

/// L'état d'activation servi dans la charge de soi (#8239, loi serveur #8238) :
/// `activation: { phase, deadline, missing }`. Une forme inconnue ne doit
/// jamais faire tomber le décodage de l'utilisateur, ni fabriquer une
/// invitation ; une passerelle antérieure (champ absent) ne change rien.
final class UserActivationTests: XCTestCase {

    private func decodeUser(_ json: String) throws -> MeeshyUser {
        try JSONDecoder().decode(MeeshyUser.self, from: Data(json.utf8))
    }

    func test_decode_invite_readsPhaseDeadlineAndMissing() throws {
        let user = try decodeUser(#"{"id":"u1","username":"amina","activation":{"phase":"invite","deadline":"2026-10-20T10:00:00.000Z","missing":["email","phone"]}}"#)

        XCTAssertEqual(user.activation, UserActivation(phase: .invite, deadline: "2026-10-20T10:00:00.000Z", missing: [.email, .phone]))
        XCTAssertEqual(user.activation?.invites, true)
    }

    func test_decode_absentField_isNil() throws {
        let user = try decodeUser(#"{"id":"u1","username":"amina"}"#)

        XCTAssertNil(user.activation)
    }

    func test_decode_unknownPhase_keepsUserAndNeverInvites() throws {
        let user = try decodeUser(#"{"id":"u1","username":"amina","activation":{"phase":"grace","deadline":null,"missing":["email"]}}"#)

        XCTAssertNil(user.activation?.phase)
        XCTAssertEqual(user.activation?.invites, false)
    }

    func test_decode_unknownChannel_isDroppedAlone() throws {
        let user = try decodeUser(#"{"id":"u1","username":"amina","activation":{"phase":"invite","deadline":null,"missing":["email","pigeon"]}}"#)

        XCTAssertEqual(user.activation?.missing, [.email])
    }

    func test_invites_onlyInInvitePhaseWithSomethingMissing() {
        XCTAssertFalse(UserActivation(phase: .quiet, deadline: nil, missing: [.email]).invites)
        XCTAssertFalse(UserActivation(phase: .blocked, deadline: nil, missing: [.email]).invites)
        XCTAssertFalse(UserActivation(phase: .done, deadline: nil, missing: [.phone]).invites)
        XCTAssertFalse(UserActivation(phase: .invite, deadline: nil, missing: []).invites)
    }

    func test_daysLeft_roundsUpAndNeverNegative() {
        let now = Date(timeIntervalSince1970: 1_790_000_000)
        let in12Days = ISO8601DateFormatter().string(from: now.addingTimeInterval(12 * 86_400))
        let inOneHour = ISO8601DateFormatter().string(from: now.addingTimeInterval(3_600))
        let yesterday = ISO8601DateFormatter().string(from: now.addingTimeInterval(-86_400))

        XCTAssertEqual(UserActivation(phase: .invite, deadline: in12Days, missing: [.email]).daysLeft(now: now), 12)
        XCTAssertEqual(UserActivation(phase: .invite, deadline: inOneHour, missing: [.email]).daysLeft(now: now), 1)
        XCTAssertEqual(UserActivation(phase: .invite, deadline: yesterday, missing: [.email]).daysLeft(now: now), 0)
        XCTAssertNil(UserActivation(phase: .invite, deadline: nil, missing: [.email]).daysLeft(now: now))
    }

    func test_daysLeft_readsFractionalSecondsServedByGateway() {
        let now = ISO8601DateFormatter().date(from: "2026-10-18T10:00:00Z")!

        XCTAssertEqual(UserActivation(phase: .invite, deadline: "2026-10-20T10:00:00.000Z", missing: [.email]).daysLeft(now: now), 2)
    }

    func test_encodeDecode_roundTripsThroughTheKeychainCopy() throws {
        let user = MeeshyUser(id: "u1", username: "amina", activation: UserActivation(phase: .done, deadline: nil, missing: [.phone]))

        let copy = try JSONDecoder().decode(MeeshyUser.self, from: JSONEncoder().encode(user))

        XCTAssertEqual(copy.activation, user.activation)
    }

    func test_withProfileChanges_carriesActivation() {
        let activation = UserActivation(phase: .invite, deadline: nil, missing: [.email])
        let user = MeeshyUser(id: "u1", username: "amina", activation: activation)

        XCTAssertEqual(user.withProfileChanges(displayName: "Amina").activation, activation)
        XCTAssertEqual(user.withProfileChanges(displayName: "Amina", bio: nil, avatar: nil).activation, activation)
    }

    func test_droppingDataURIImages_carriesActivationAndDropsInlineAvatar() {
        let activation = UserActivation(phase: .invite, deadline: nil, missing: [.phone])
        let user = MeeshyUser(id: "u1", username: "amina", avatar: "data:image/png;base64,AAA", activation: activation)

        let persisted = user.droppingDataURIImages()

        XCTAssertNil(persisted.avatar)
        XCTAssertEqual(persisted.activation, activation)
    }
}
