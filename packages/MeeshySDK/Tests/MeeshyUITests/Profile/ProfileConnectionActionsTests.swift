import XCTest
import MeeshySDK
@testable import MeeshyUI

@MainActor
final class ProfileConnectionActionsTests: XCTestCase {

    @MainActor
    private struct Fixture {
        let relationships = SpyProfileRelationshipState()
        let social = StubProfileSocialActions()
        var sut: ProfileConnectionActions { ProfileConnectionActions(relationships: relationships, social: social) }
    }

    func test_sendRequest_succes_inscritLaDemandeEnvoyee() async {
        let fixture = Fixture()
        fixture.social.sendResult = .success(ProfileDependencyDoubles.makeFriendRequest(id: "req-9"))

        let outcome = await fixture.sut.sendRequest(to: "u-bob")

        XCTAssertEqual(outcome, .sent(ProfileDependencyDoubles.makeFriendRequest(id: "req-9")))
        XCTAssertEqual(fixture.relationships.events, ["didSend:u-bob:\(ProfileConnectionActions.provisionalRequestId(for: "u-bob"))",
                                                      "didSend:u-bob:req-9"])
    }

    /// Planche `Etat-Demande` — la demande quitte l'écran dès le geste : l'étape « Envoyée » s'affiche avant le réseau.
    func test_sendRequest_poseLaDemandeAvantLeReseau() async {
        let fixture = Fixture()
        fixture.social.sendResult = .success(ProfileDependencyDoubles.makeFriendRequest(id: "req-9"))
        var optimistic: [String] = []

        _ = await fixture.sut.sendRequest(to: "u-bob") { optimistic.append($0) }

        XCTAssertEqual(optimistic, [ProfileConnectionActions.provisionalRequestId(for: "u-bob")])
    }

    /// Un second appui pendant l'envoi ne part pas : une seule demande atteint le réseau.
    func test_sendRequest_doubleAppui_unSeulEnvoi() async {
        let fixture = Fixture()
        fixture.social.sendResult = .success(ProfileDependencyDoubles.makeFriendRequest(id: "req-9"))

        let first = await fixture.sut.sendRequest(to: "u-bob")
        let second = await fixture.sut.sendRequest(to: "u-bob")

        XCTAssertEqual(first, .sent(ProfileDependencyDoubles.makeFriendRequest(id: "req-9")))
        XCTAssertEqual(second, .alreadyPending)
        XCTAssertEqual(fixture.social.sendCalls, ["u-bob"])
    }

    /// La demande servie porte sa date : l'étape dit « envoyée à l'instant » sans attendre le cache.
    func test_sendRequest_succes_lEtapeDitLaDateServie() async {
        let fixture = Fixture()
        let createdAt = Date(timeIntervalSince1970: 5_000)
        fixture.social.sendResult = .success(ProfileDependencyDoubles.makeFriendRequest(id: "req-9", createdAt: createdAt))

        let outcome = await fixture.sut.sendRequest(to: "u-bob")
        guard case .sent(let request) = outcome else { return XCTFail("la demande devait partir") }
        let stage = ProfileRequestStage.resolve(connection: .pendingSent(requestId: request.id), request: request,
                                                justAccepted: false)

        XCTAssertEqual(stage, .sent(sentAt: createdAt))
    }

    /// Planche `Etat-Demande` — « Ajoute un mot » est facultatif : le mot part rogné, un mot vide ne part pas.
    func test_sendRequest_avecUnMot_lEnvoieRogne() async {
        let fixture = Fixture()
        fixture.social.sendResult = .success(ProfileDependencyDoubles.makeFriendRequest(id: "req-9"))

        _ = await fixture.sut.sendRequest(to: "u-bob", message: "  On s'est croisées au festival  ")

        XCTAssertEqual(fixture.social.sentMessages, ["On s'est croisées au festival"])
    }

    func test_sendRequest_motVide_nEnvoieAucunMot() async {
        let fixture = Fixture()
        fixture.social.sendResult = .success(ProfileDependencyDoubles.makeFriendRequest(id: "req-9"))

        _ = await fixture.sut.sendRequest(to: "u-bob", message: "   ")

        XCTAssertEqual(fixture.social.sentMessages, [nil])
    }

    func test_sendRequest_echec_defaitLaDemandeOptimiste() async {
        let fixture = Fixture()
        fixture.social.sendResult = .failure(StubFailure())

        let outcome = await fixture.sut.sendRequest(to: "u-bob")

        XCTAssertEqual(outcome, .failed)
        XCTAssertEqual(fixture.relationships.status(for: "u-bob"), FriendshipStatus.none)
        XCTAssertEqual(fixture.relationships.events.last, "didCancel:u-bob")
    }

    // MARK: - Renvoyer

    /// L'ancienne demande est retirée, la nouvelle ne part pas : l'étape retombe sur « La demande n'est pas partie ».
    func test_resendRequest_envoiEnEchec_retombeSurNonPartieEtOublieLAncienId() async {
        let fixture = Fixture()
        fixture.relationships.statuses["u-bob"] = .pendingSent(requestId: "req-1")
        fixture.social.sendResult = .failure(StubFailure())
        var withdrawn = 0

        let outcome = await fixture.sut.resendRequest(requestId: "req-1", userId: "u-bob", message: nil,
                                                      afterWithdrawn: { withdrawn += 1 })
        let stage = ProfileRequestStage.resolve(connection: ConnectionStatus(friendship: fixture.relationships.status(for: "u-bob")),
                                                request: nil, justAccepted: false, sendFailed: outcome == .unsent)

        XCTAssertEqual(outcome, .unsent)
        XCTAssertEqual(withdrawn, 1)
        XCTAssertEqual(fixture.social.deleteCalls, ["req-1"])
        XCTAssertEqual(stage, .unsent)
    }

    /// Le retrait refusé ne part pas en double : l'ancienne demande est remise, rien n'est renvoyé.
    func test_resendRequest_retraitRefuse_remetLAncienneDemande() async {
        let fixture = Fixture()
        fixture.relationships.statuses["u-bob"] = .pendingSent(requestId: "req-1")
        fixture.social.deleteResult = .failure(StubFailure())

        let outcome = await fixture.sut.resendRequest(requestId: "req-1", userId: "u-bob", message: nil, afterWithdrawn: {})

        XCTAssertEqual(outcome, .withdrawFailed)
        XCTAssertEqual(fixture.social.sendCalls, [])
        XCTAssertEqual(fixture.relationships.status(for: "u-bob"), .pendingSent(requestId: "req-1"))
    }

    /// Le mot parti avec la première demande repart avec la seconde.
    func test_resendRequest_renvoieLeMotDOrigine() async {
        let fixture = Fixture()
        fixture.relationships.statuses["u-bob"] = .pendingSent(requestId: "req-1")
        fixture.social.sendResult = .success(ProfileDependencyDoubles.makeFriendRequest(id: "req-2", message: "Du festival"))

        let outcome = await fixture.sut.resendRequest(requestId: "req-1", userId: "u-bob", message: "Du festival",
                                                      afterWithdrawn: {})

        XCTAssertEqual(outcome, .resent(ProfileDependencyDoubles.makeFriendRequest(id: "req-2", message: "Du festival")))
        XCTAssertEqual(fixture.social.sentMessages, ["Du festival"])
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

        let reported = await fixture.sut.report(userId: "u-bob", reportType: "spam", reason: nil)

        XCTAssertTrue(reported)
        XCTAssertEqual(fixture.social.reportCalls.map(\.reportType), ["spam"])
        XCTAssertEqual(fixture.social.reportCalls.map(\.userId), ["u-bob"])
        XCTAssertEqual(fixture.social.reportCalls.map(\.reason), [nil])
    }

    /// #18873 — le mot facultatif de la feuille « Signaler » part avec le motif.
    func test_report_transmetLeMotDuSignalement() async {
        let fixture = Fixture()

        let reported = await fixture.sut.report(userId: "u-bob", reportType: "harassment", reason: "Il m'écrit tous les jours")

        XCTAssertTrue(reported)
        XCTAssertEqual(fixture.social.reportCalls.map(\.reason), ["Il m'écrit tous les jours"])
    }

    // MARK: - Signaler, puis bloquer

    /// « Bloquer aussi » demandé, le blocage rate : le résultat le dit, la feuille ne le tait pas.
    func test_reportThenBlock_blocageEnEchec_leResultatLeDit() async {
        let fixture = Fixture()
        fixture.social.blockResult = .failure(StubFailure())
        let draft = ProfileReportDraft().choosing("harassment").togglingBlock()

        let outcome = await fixture.sut.reportThenBlock(userId: "u-bob", draft: draft, alreadyBlocked: false)

        XCTAssertTrue(outcome.isSent)
        XCTAssertTrue(outcome.blockRequested)
        XCTAssertFalse(outcome.isBlocked)
        XCTAssertTrue(outcome.blockFailed)
        XCTAssertTrue(outcome.blocking().isBlocked)
    }

    func test_reportThenBlock_sansBloquerAussi_neDemandeAucunBlocage() async {
        let fixture = Fixture()
        let draft = ProfileReportDraft().choosing("spam")

        let outcome = await fixture.sut.reportThenBlock(userId: "u-bob", draft: draft, alreadyBlocked: false)

        XCTAssertEqual(outcome, ProfileReportOutcome(isSent: true, isBlocked: false))
        XCTAssertFalse(outcome.blockFailed)
        XCTAssertEqual(fixture.social.blockCalls, [])
    }
}
