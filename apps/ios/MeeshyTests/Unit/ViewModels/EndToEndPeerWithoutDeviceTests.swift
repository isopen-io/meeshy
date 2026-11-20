import XCTest
@testable import Meeshy
import MeeshySDK

/// **Un pair sans appareil chiffré se SAIT, et se dit** (#20074, #20073) : la
/// liste de ses appareils l'apprend, le refus d'envoi le confirme, un appareil
/// publié l'efface ; le bandeau ne paraît que sur ce qui est su ; une bascule
/// ou une création de direct en bout en bout refusée nomme le membre.
@MainActor
final class EndToEndPeerWithoutDeviceTests: XCTestCase {

    private final class StubCounter: EndToEndPeerDeviceCounting, @unchecked Sendable {
        var result: Result<Int, Error>
        init(_ result: Result<Int, Error>) { self.result = result }
        func encryptedDeviceCount(of userId: String) async throws -> Int { try result.get() }
    }

    private func makeReach(_ result: Result<Int, Error>) -> (EndToEndPeerDeviceReach, StubCounter) {
        let counter = StubCounter(result)
        return (EndToEndPeerDeviceReach(counter: counter), counter)
    }

    // MARK: - Ce que l'app sait du pair

    func test_refresh_noDevice_learnsThePeerLacksOne() async {
        let (reach, _) = makeReach(.success(0))

        await reach.refresh("peer")

        XCTAssertTrue(reach.lacksEncryptedDevice("peer"))
    }

    func test_refresh_deviceAppears_forgetsTheLack() async {
        let (reach, counter) = makeReach(.success(0))
        await reach.refresh("peer")
        counter.result = .success(1)

        await reach.refresh("peer")

        XCTAssertFalse(reach.lacksEncryptedDevice("peer"))
    }

    func test_refresh_readFails_saysNothingNew() async {
        let (reach, _) = makeReach(.failure(URLError(.notConnectedToInternet)))

        await reach.refresh("peer")

        XCTAssertFalse(reach.lacksEncryptedDevice("peer"), "aucun bandeau sur une supposition")
    }

    func test_confirmWithoutDevice_fromTheSendRefusal_isRemembered() {
        let (reach, _) = makeReach(.success(1))

        reach.confirmWithoutDevice("peer")

        XCTAssertTrue(reach.lacksEncryptedDevice("peer"))
    }

    // MARK: - Le bandeau

    func test_bannerRule_showsOnlyInAnEndToEndDirectWithAPeerKnownWithoutDevice() {
        XCTAssertTrue(EndToEndPeerWithoutDeviceBannerRule.shows(sealsEndToEnd: true, isDirect: true, peerLacksDevice: true))
        XCTAssertFalse(EndToEndPeerWithoutDeviceBannerRule.shows(sealsEndToEnd: false, isDirect: true, peerLacksDevice: true))
        XCTAssertFalse(EndToEndPeerWithoutDeviceBannerRule.shows(sealsEndToEnd: true, isDirect: false, peerLacksDevice: true))
        XCTAssertFalse(EndToEndPeerWithoutDeviceBannerRule.shows(sealsEndToEnd: true, isDirect: true, peerLacksDevice: false))
    }

    func test_bannerTitle_namesThePeerByFirstName() {
        let title = EndToEndPeerWithoutDeviceBannerRule.title(peerName: "Mama Ngono")

        XCTAssertTrue(title.contains("Mama"))
        XCTAssertFalse(title.contains("Ngono"))
    }

    // MARK: - Le refus d'activation (#20073)

    private func participantWithoutDevice(_ ids: [String]) -> MeeshyError {
        .rejected(APIRejection(
            statusCode: 409, code: E2EEErrorCode.participantWithoutDevice, message: "refused",
            withoutDeviceUserIds: ids, isGatewayEnvelope: true
        ))
    }

    func test_refusal_matchesOnlyItsCode() {
        XCTAssertTrue(EndToEndParticipantWithoutDeviceRefusal.matches(participantWithoutDevice([])))
        XCTAssertFalse(EndToEndParticipantWithoutDeviceRefusal.matches(MeeshyError.server(statusCode: 409, message: "x")))
    }

    func test_refusalMessage_withoutNamedMembers_namesThePeer() {
        let message = EndToEndParticipantWithoutDeviceRefusal.message(
            peerUserId: "peer", peerName: "Mama Ngono", withoutDeviceUserIds: []
        )

        XCTAssertTrue(message.contains("Mama"))
    }

    func test_refusalMessage_namingThePeer_namesThePeer() {
        let message = EndToEndParticipantWithoutDeviceRefusal.message(
            peerUserId: "peer", peerName: "Mama", withoutDeviceUserIds: ["peer"]
        )

        XCTAssertTrue(message.contains("Mama"))
    }

    func test_refusalMessage_namingSomeoneElse_doesNotBlameThePeer() {
        let message = EndToEndParticipantWithoutDeviceRefusal.message(
            peerUserId: "peer", peerName: "Mama", withoutDeviceUserIds: ["me"]
        )

        XCTAssertFalse(message.contains("Mama"))
    }

    func test_withoutDeviceUserIds_readsTheRejection() {
        XCTAssertEqual(EndToEndParticipantWithoutDeviceRefusal.withoutDeviceUserIds(in: participantWithoutDevice(["a"])), ["a"])
        XCTAssertEqual(EndToEndParticipantWithoutDeviceRefusal.withoutDeviceUserIds(in: URLError(.timedOut)), [])
    }

    // MARK: - La création d'un direct en bout en bout refusée

    func test_openDirect_participantWithoutDevice_namesTheInvitee() async {
        let api = MockAPIClientForApp()
        api.errorToThrow = participantWithoutDevice([])
        let sut = NewConversationViewModel(
            api: api, friendService: MockFriendService(),
            currentUserIdProvider: { "me" }, platformRoleProvider: { "USER" }
        )
        let invitee: SearchedUser = JSONStub.decode("""
        {"id":"peer","username":"mama","firstName":"Mama","lastName":"Ngono","displayName":null,"email":null,"isOnline":null,"lastActiveAt":null,"avatar":null}
        """)

        await sut.openDirect(with: invitee)

        let message = try? XCTUnwrap(sut.errorMessage)
        XCTAssertEqual(message, EndToEndParticipantWithoutDeviceRefusal.message(
            peerUserId: "peer", peerName: "Mama", withoutDeviceUserIds: []
        ))
        XCTAssertNil(sut.createdConversation)
    }

    func test_inviteeName_prefersTheFirstName() {
        let user: SearchedUser = JSONStub.decode("""
        {"id":"u","username":"mama","firstName":null,"lastName":null,"displayName":"Mama N.","email":null,"isOnline":null,"lastActiveAt":null,"avatar":null}
        """)

        XCTAssertEqual(NewConversationViewModel.inviteeName(user), "Mama N.")
    }
}
