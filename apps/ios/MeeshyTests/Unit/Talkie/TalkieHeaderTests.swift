import AVFoundation
import XCTest
import MeeshySDK
@testable import Meeshy

/// Le talkie se tient aussi depuis l'en-tête d'un direct (#17093) : proposé dès Proche, par le lien ou par le niveau
/// d'outil servi, jamais dans un direct chiffré ; le bouton réagit au doigt avant le réseau.
@MainActor
final class TalkieHeaderTests: XCTestCase {

    override func setUp() async throws {
        try await super.setUp()
        await CacheCoordinator.shared.relationLinks.invalidate(for: CirclesViewModel.cacheKey)
    }

    override func tearDown() async throws {
        await CacheCoordinator.shared.relationLinks.invalidate(for: CirclesViewModel.cacheKey)
        try await super.tearDown()
    }

    private func link(_ userId: String, _ level: RelationLevel, access: RelationLevel? = nil) -> RelationLink {
        RelationLink(userId: userId, effectiveLevel: level, grantedByMe: level, accessLevel: access)
    }

    private func makeSUT(userId: String = "peer") -> (TalkieOfferModel, MockRelationsService) {
        let relations = MockRelationsService()
        let sut = TalkieOfferModel(userId: userId, relations: relations, networkMonitor: FakeNetworkMonitor(isOnline: true))
        return (sut, relations)
    }

    // MARK: - La loi

    func test_offers_fromCloseUp_only() {
        XCTAssertFalse(TalkieOfferRule.offers(link("a", .friend)))
        XCTAssertTrue(TalkieOfferRule.offers(link("a", .close)))
        XCTAssertTrue(TalkieOfferRule.offers(link("a", .blood)))
    }

    func test_offers_byTheServedToolLevel_withoutALink() {
        XCTAssertTrue(TalkieOfferRule.offers(link("a", .public, access: .blood)))
    }

    /// Recette du 2026-11-09 : un destinataire qui n'avait jamais parlé n'avait aucun canal PushToTalk, et iOS
    /// jetait chaque réveil. Le canal se rejoint dès qu'au moins une personne peut lui parler.
    func test_reachable_assoonAsOnePeerIsCloseOrTheAccountIsTeam() {
        XCTAssertFalse(TalkieOfferRule.reachable(links: [], role: "USER"))
        XCTAssertFalse(TalkieOfferRule.reachable(links: [link("a", .friend)], role: "USER"))
        XCTAssertTrue(TalkieOfferRule.reachable(links: [link("a", .friend), link("b", .close)], role: "USER"))
        XCTAssertTrue(TalkieOfferRule.reachable(links: [], role: "MODERATOR"))
        XCTAssertTrue(TalkieOfferRule.reachable(links: [], role: "AUDIT"))
        XCTAssertTrue(TalkieOfferRule.reachable(links: [], role: "ANALYST"))
        XCTAssertFalse(TalkieOfferRule.reachable(links: [], role: "AGENT"))
        XCTAssertFalse(TalkieOfferRule.reachable(links: [], role: nil))
    }

    func test_header_hidesTheTalkie_inAnEncryptedDirect() {
        XCTAssertFalse(TalkieOfferRule.mayShowInHeader(encryptionMode: "e2ee"))
        XCTAssertTrue(TalkieOfferRule.mayShowInHeader(encryptionMode: "server"))
        XCTAssertTrue(TalkieOfferRule.mayShowInHeader(encryptionMode: nil))
    }

    // MARK: - Le modèle

    func test_load_offersTheTalkie_toACloseFriend() async {
        let (sut, relations) = makeSUT()
        relations.linksResult = .success([link("peer", .close)])
        await sut.load()
        XCTAssertTrue(sut.offered)
    }

    func test_load_offersTheTalkie_betweenTwoTeamAccounts() async {
        let (sut, relations) = makeSUT()
        relations.linkResult = .success(link("peer", .public, access: .blood))
        await sut.load()
        XCTAssertTrue(sut.offered)
    }

    func test_load_withdrawsTheTalkie_whenTheServerJudgesItBelowClose() async {
        let (sut, relations) = makeSUT()
        relations.linksResult = .success([link("peer", .close)])
        relations.linkResult = .success(link("peer", .friend))
        await sut.load()
        XCTAssertFalse(sut.offered)
    }

    func test_load_ignoresAnotherPersonsLink() async {
        let (sut, relations) = makeSUT()
        relations.linksResult = .success([link("other", .blood)])
        await sut.load()
        XCTAssertFalse(sut.offered)
    }

    // MARK: - Le geste

    func test_look_isPressedAsSoonAsTheFingerLands_beforeTheNetwork() {
        XCTAssertEqual(TalkieHoldLook.resolve(pressed: true, phase: .idle), .pressed)
        XCTAssertEqual(TalkieHoldLook.resolve(pressed: true, phase: .starting(toUserId: "p")), .pressed)
    }

    func test_look_isLive_whileTheVoiceFlows() {
        XCTAssertEqual(TalkieHoldLook.resolve(pressed: true, phase: .talking(toUserId: "p", talkieId: "t")), .live)
        XCTAssertEqual(TalkieHoldLook.resolve(pressed: false, phase: .talking(toUserId: "p", talkieId: "t")), .live)
    }

    func test_look_restsWhenNothingHappens() {
        XCTAssertEqual(TalkieHoldLook.resolve(pressed: false, phase: .idle), .idle)
    }

    func test_aFragmentThatChangesFormatMidTurn_isNotPlayed() throws {
        let mono = try XCTUnwrap(AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 1))
        let stereo = try XCTUnwrap(AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 2))
        let slower = try XCTUnwrap(AVAudioFormat(standardFormatWithSampleRate: 16_000, channels: 1))
        XCTAssertTrue(TalkieVoicePlayer.mayPlay(mono, on: mono))
        XCTAssertFalse(TalkieVoicePlayer.mayPlay(stereo, on: mono))
        XCTAssertFalse(TalkieVoicePlayer.mayPlay(slower, on: mono))
    }

    func test_aQuickTap_isNotAHold() {
        XCTAssertTrue(TalkieHoldLook.isQuickTap(heldFor: 0.12))
        XCTAssertFalse(TalkieHoldLook.isQuickTap(heldFor: 0.6))
    }
}
