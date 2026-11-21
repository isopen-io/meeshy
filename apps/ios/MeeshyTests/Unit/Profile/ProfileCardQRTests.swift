import XCTest
import MeeshySDK
@testable import Meeshy

/// Ma carte de profil (#19487, planche `Carte-Profil`) : « Mettre en story » parmi ses actions, et « Ce QR montre »
/// qui choisit la charge du QR — ma vitrine, ou une invitation dont le jeton bref fait partir une demande d'ami.
@MainActor
final class ProfileCardQRTests: XCTestCase {

    nonisolated private static let expiry: TimeInterval = 1_795_000_000
    nonisolated private static let token = "ce1.AAAAAAAAAAAAAAAAAAAAAA.2.1795000000.BBBBBBBBBBBBBBBBBBBBBB"
    nonisolated private static let renewed = "ce1.CCCCCCCCCCCCCCCCCCCCCC.2.1795000120.DDDDDDDDDDDDDDDDDDDDDD"

    final class FakeService: ContactExchangeProviding, @unchecked Sendable {
        var tokens: [String] = []
        var failsIssue = false
        var accepted: Result<ContactExchangeAccepted, Error> = .failure(ContactExchangeError.unavailable)
        var askedOffers: [[ContactExchangeOffer]] = []

        func issue(offers: [ContactExchangeOffer]) async throws -> ContactExchangeIssued {
            askedOffers.append(offers)
            if failsIssue { throw ContactExchangeError.unavailable }
            let token = tokens.isEmpty ? ProfileCardQRTests.token : tokens.removeFirst()
            return ContactExchangeIssued(token: token, expiresAt: "", offers: offers)
        }

        func accept(token: String) async throws -> ContactExchangeAccepted {
            try accepted.get()
        }
    }

    nonisolated final class PauseLog: @unchecked Sendable {
        var delays: [TimeInterval] = []
        let allowed: Int

        init(allowed: Int) { self.allowed = allowed }

        func pause(_ seconds: TimeInterval) throws {
            delays.append(seconds)
            if delays.count > allowed { throw CancellationError() }
        }
    }

    private func makeLink() -> ProfileLink {
        guard let link = ProfileLink(username: "aissa") else { fatalError("pseudo de test invalide") }
        return link
    }

    private func makeModel(service: FakeService, log: PauseLog) -> ProfileCardQRModel {
        let now = Date(timeIntervalSince1970: Self.expiry - 100)
        return ProfileCardQRModel(service: service, pause: { seconds in try log.pause(seconds) }, now: { now })
    }

    // MARK: - Les actions

    func test_offered_withMyProfile_followsThePlancheOrder_withPutInStoryThird() {
        XCTAssertEqual(ProfileCardAction.offered(canSend: true), [.copy, .send, .story, .save, .more])
    }

    func test_offered_withoutMyProfile_keepsPutInStory_butNotSend() {
        XCTAssertEqual(ProfileCardAction.offered(canSend: false), [.copy, .story, .save, .more])
    }

    // MARK: - L'adresse d'invitation

    func test_invitationURL_carriesTheTokenOnMyProfileAddress() {
        let url = ProfileInvitationLink.url(for: makeLink(), token: Self.token)
        XCTAssertEqual(url?.absoluteString, "https://meeshy.me/@aissa?ce=\(Self.token)")
    }

    func test_invitationURL_refusesAMalformedToken() {
        XCTAssertNil(ProfileInvitationLink.url(for: makeLink(), token: "ce1.court"))
    }

    func test_invitationIn_readsTheTokenAndTheBareProfile() throws {
        let url = try XCTUnwrap(URL(string: "https://meeshy.me/@aissa?ce=\(Self.token)"))
        let scan = ProfileInvitationLink.invitation(in: url)
        XCTAssertEqual(scan?.token, Self.token)
        XCTAssertEqual(scan?.profile.absoluteString, "https://meeshy.me/@aissa")
    }

    func test_invitationIn_ignoresAForeignHost_aPlainProfile_andAForgedToken() throws {
        let foreign = try XCTUnwrap(URL(string: "https://example.com/@aissa?ce=\(Self.token)"))
        let plain = try XCTUnwrap(URL(string: "https://meeshy.me/@aissa"))
        let forged = try XCTUnwrap(URL(string: "https://meeshy.me/@aissa?ce=ce1.x"))
        let insecure = try XCTUnwrap(URL(string: "http://meeshy.me/@aissa?ce=\(Self.token)"))
        XCTAssertNil(ProfileInvitationLink.invitation(in: foreign))
        XCTAssertNil(ProfileInvitationLink.invitation(in: plain))
        XCTAssertNil(ProfileInvitationLink.invitation(in: forged))
        XCTAssertNil(ProfileInvitationLink.invitation(in: insecure))
    }

    func test_expiry_isReadFromTheToken() {
        XCTAssertEqual(ProfileInvitationLink.expiry(of: Self.token), Date(timeIntervalSince1970: Self.expiry))
    }

    // MARK: - La charge du QR

    func test_payload_byDefault_isMyShowcase() {
        let link = makeLink()
        XCTAssertEqual(ProfileCardQRState().payload(for: link), link.url)
    }

    func test_payload_whileTheInvitationIsPreparing_staysMyShowcase() {
        let link = makeLink()
        let state = ProfileCardQRState().choosing(.invitation)
        XCTAssertTrue(state.isPreparingInvitation)
        XCTAssertEqual(state.payload(for: link), link.url)
    }

    func test_backToShowcase_dropsTheIssuedToken() {
        let link = makeLink()
        let issued = ProfileCardQRState(shows: .invitation, invitation: .issued(token: Self.token))
        let back = issued.choosing(.showcase).choosing(.invitation)
        XCTAssertEqual(back.invitation, .notIssued)
        XCTAssertEqual(back.payload(for: link), link.url)
    }

    func test_refreshDelay_renewsBeforeExpiry_neverInABurst() {
        let state = ProfileCardQRState(shows: .invitation, invitation: .issued(token: Self.token))
        let early = state.refreshDelay(now: Date(timeIntervalSince1970: Self.expiry - 100))
        let late = state.refreshDelay(now: Date(timeIntervalSince1970: Self.expiry))
        XCTAssertEqual(early, 85)
        XCTAssertEqual(late, ProfileCardQRState.minimumRefresh)
    }

    // MARK: - Le QR vivant

    func test_choosingInvitation_issuesATokenThatOffersOnlyTheFriendRequest_andTheQRCarriesIt() async {
        let service = FakeService()
        let model = makeModel(service: service, log: PauseLog(allowed: 0))
        model.choose(.invitation)
        await model.keepInvitationFresh()
        let link = makeLink()
        XCTAssertEqual(service.askedOffers, [[.friendRequest]])
        XCTAssertEqual(model.state.payload(for: link).absoluteString, "https://meeshy.me/@aissa?ce=\(Self.token)")
        XCTAssertTrue(model.state.carriesInvitation(for: link))
    }

    func test_invitation_isRenewedBeforeItsExpiry() async {
        let service = FakeService()
        service.tokens = [Self.token, Self.renewed]
        let log = PauseLog(allowed: 1)
        let model = makeModel(service: service, log: log)
        model.choose(.invitation)
        await model.keepInvitationFresh()
        XCTAssertEqual(service.askedOffers.count, 2)
        XCTAssertEqual(log.delays.first, 85)
        XCTAssertEqual(model.state.invitation, .issued(token: Self.renewed))
    }

    func test_refusedInvitation_isSaid_andTheQRKeepsMyShowcase() async {
        let service = FakeService()
        service.failsIssue = true
        let model = makeModel(service: service, log: PauseLog(allowed: 0))
        model.choose(.invitation)
        await model.keepInvitationFresh()
        let link = makeLink()
        XCTAssertTrue(model.state.isInvitationUnavailable)
        XCTAssertEqual(model.state.payload(for: link), link.url)
    }

    func test_showcase_neverAsksTheGatewayForAToken() async {
        let service = FakeService()
        let model = makeModel(service: service, log: PauseLog(allowed: 0))
        await model.keepInvitationFresh()
        XCTAssertTrue(service.askedOffers.isEmpty)
    }

    // MARK: - L'invitation scannée

    func test_scannedInvitation_sendsTheFriendRequest_whenTheGatewaySaysSo() async {
        let service = FakeService()
        let issuer = ContactExchangePerson(id: "65a1b2c3d4e5f6a7b8c9d0e1", username: "aissa", displayName: nil, avatar: nil)
        service.accepted = .success(ContactExchangeAccepted(issuer: issuer, offers: [.friendRequest], bio: nil,
                                                            friendRequest: .sent))
        let outcome = await ProfileInvitationAcceptance.accept(Self.token, service: service)
        XCTAssertEqual(outcome, .friendRequestSent)
    }

    func test_scannedInvitation_thatExpired_stillOpensTheProfile_andSaysIt() async {
        let outcome = await ProfileInvitationAcceptance.accept(Self.token, service: FakeService())
        XCTAssertEqual(outcome, .expired)
    }
}
