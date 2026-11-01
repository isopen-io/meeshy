import XCTest
import MeeshySDK
@testable import MeeshyUI

@MainActor
final class ProfileConnectionActionsTests: XCTestCase {

    private struct Fixture {
        let relationships = SpyProfileRelationshipState()
        let social = StubProfileSocialActions()
        var sut: ProfileConnectionActions { ProfileConnectionActions(relationships: relationships, social: social) }
    }

    func test_sendRequest_succes_inscritLaDemandeEnvoyee() async {
        let fixture = Fixture()
        fixture.social.sendResult = .success(ProfileDependencyDoubles.makeFriendRequest(id: "req-9"))

        let requestId = await fixture.sut.sendRequest(to: "u-bob")

        XCTAssertEqual(requestId, "req-9")
        XCTAssertEqual(fixture.relationships.events, ["didSend:u-bob:req-9"])
    }

    func test_sendRequest_echec_rendNilSansToucherLEtat() async {
        let fixture = Fixture()
        fixture.social.sendResult = .failure(StubFailure())

        let requestId = await fixture.sut.sendRequest(to: "u-bob")

        XCTAssertNil(requestId)
        XCTAssertEqual(fixture.relationships.events, [])
    }

    func test_cancelRequest_echec_restaureLaDemande() async {
        let fixture = Fixture()
        fixture.social.deleteResult = .failure(StubFailure())

        let cancelled = await fixture.sut.cancelRequest(requestId: "req-1", userId: "u-bob") {}

        XCTAssertFalse(cancelled)
        XCTAssertEqual(fixture.relationships.events, ["didCancel:u-bob", "didSend:u-bob:req-1"])
    }

    func test_acceptRequest_echec_annuleLAcceptation() async {
        let fixture = Fixture()
        fixture.social.respondResult = .failure(StubFailure())

        let accepted = await fixture.sut.acceptRequest(requestId: "req-1", senderId: "u-bob") {}

        XCTAssertFalse(accepted)
        XCTAssertEqual(fixture.relationships.events, ["didAccept:u-bob", "rollbackAccept:u-bob:req-1"])
        XCTAssertEqual(fixture.social.respondCalls.map(\.accepted), [true])
    }

    func test_declineRequest_echec_annuleLeRefus() async {
        let fixture = Fixture()
        fixture.social.respondResult = .failure(StubFailure())

        let declined = await fixture.sut.declineRequest(requestId: "req-1", senderId: "u-bob") {}

        XCTAssertFalse(declined)
        XCTAssertEqual(fixture.relationships.events, ["didReject:u-bob", "rollbackReject:u-bob:req-1"])
        XCTAssertEqual(fixture.social.respondCalls.map(\.accepted), [false])
    }

    func test_block_succes_rendVraiEtTransmetLUserId() async {
        let fixture = Fixture()

        let blocked = await fixture.sut.block(userId: "u-bob")

        XCTAssertTrue(blocked)
        XCTAssertEqual(fixture.social.blockCalls, ["u-bob"])
    }

    func test_report_transmetLeTypeSansRaison() async {
        let fixture = Fixture()

        let reported = await fixture.sut.report(userId: "u-bob", reportType: "spam")

        XCTAssertTrue(reported)
        XCTAssertEqual(fixture.social.reportCalls.map(\.reportType), ["spam"])
        XCTAssertEqual(fixture.social.reportCalls.map(\.userId), ["u-bob"])
    }
}
