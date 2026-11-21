import XCTest
import MeeshySDK
@testable import MeeshyUI

/// #19611 — planche `Etat-Erreur` vue 2 : une action de relation ratée sur la fiche (accepter, refuser, annuler) laisse
/// le bouton comme avant, le DIT sur la carte et propose « Réessayer », qui rejoue la MÊME mutation optimiste.
@MainActor
final class ProfileRelationFailureTests: XCTestCase {

    @MainActor
    private struct Fixture {
        let relationships = SpyProfileRelationshipState()
        let social = StubProfileSocialActions()
        var sut: ProfileConnectionActions { ProfileConnectionActions(relationships: relationships, social: social) }
    }

    // MARK: - La note reste tant que l'étape est celle où l'action a raté

    func test_accepterRate_seDitTantQueLaDemandeEstRecue() {
        XCTAssertTrue(ProfileRelationMutation.accept.isShown(on: .received(note: nil)))
        XCTAssertFalse(ProfileRelationMutation.accept.isShown(on: .connected))
        XCTAssertFalse(ProfileRelationMutation.accept.isShown(on: .accepted))
        XCTAssertFalse(ProfileRelationMutation.accept.isShown(on: .open))
    }

    func test_refuserRate_seDitTantQueLaDemandeEstRecue() {
        XCTAssertTrue(ProfileRelationMutation.decline.isShown(on: .received(note: nil)))
        XCTAssertFalse(ProfileRelationMutation.decline.isShown(on: .open))
        XCTAssertFalse(ProfileRelationMutation.decline.isShown(on: .sent(sentAt: nil)))
    }

    func test_annulerRate_seDitTantQueLaDemandeEstEnvoyee() {
        XCTAssertTrue(ProfileRelationMutation.cancel.isShown(on: .sent(sentAt: nil)))
        XCTAssertFalse(ProfileRelationMutation.cancel.isShown(on: .open))
        XCTAssertFalse(ProfileRelationMutation.cancel.isShown(on: .received(note: nil)))
        XCTAssertFalse(ProfileRelationMutation.cancel.isShown(on: .connected))
    }

    func test_renvoyerRate_seDitTantQueLaDemandeEstEnvoyee() {
        XCTAssertTrue(ProfileRelationMutation.resend.isShown(on: .sent(sentAt: nil)))
        XCTAssertFalse(ProfileRelationMutation.resend.isShown(on: .open))
        XCTAssertFalse(ProfileRelationMutation.resend.isShown(on: .unsent))
    }

    // MARK: - « Réessayer » rejoue la même mutation optimiste

    func test_reessayerApresUneAcceptationRatee_rejoueLAcceptationOptimiste() async {
        let fixture = Fixture()
        fixture.social.respondResult = .failure(StubFailure())
        var optimisticCount = 0

        let first = await fixture.sut.perform(.accept, requestId: "req-1", userId: "u-bob") { optimisticCount += 1 }
        fixture.social.respondResult = .success(())
        let retried = await fixture.sut.perform(.accept, requestId: "req-1", userId: "u-bob") { optimisticCount += 1 }

        XCTAssertFalse(first)
        XCTAssertTrue(retried)
        XCTAssertEqual(optimisticCount, 2)
        XCTAssertEqual(fixture.relationships.events, ["didAccept:u-bob", "rollbackAccept:u-bob:req-1", "didAccept:u-bob"])
        XCTAssertEqual(fixture.social.respondCalls.map(\.accepted), [true, true])
    }

    func test_reessayerApresUnRefusRate_rejoueLeRefusOptimiste() async {
        let fixture = Fixture()
        fixture.social.respondResult = .failure(StubFailure())

        let first = await fixture.sut.perform(.decline, requestId: "req-1", userId: "u-bob") {}
        fixture.social.respondResult = .success(())
        let retried = await fixture.sut.perform(.decline, requestId: "req-1", userId: "u-bob") {}

        XCTAssertFalse(first)
        XCTAssertTrue(retried)
        XCTAssertEqual(fixture.relationships.events, ["didReject:u-bob", "rollbackReject:u-bob:req-1", "didReject:u-bob"])
        XCTAssertEqual(fixture.social.respondCalls.map(\.accepted), [false, false])
    }

    func test_reessayerApresUneAnnulationRatee_rejoueLAnnulationOptimiste() async {
        let fixture = Fixture()
        fixture.social.deleteResult = .failure(StubFailure())

        let first = await fixture.sut.perform(.cancel, requestId: "req-1", userId: "u-bob") {}
        fixture.social.deleteResult = .success(())
        let retried = await fixture.sut.perform(.cancel, requestId: "req-1", userId: "u-bob") {}

        XCTAssertFalse(first)
        XCTAssertTrue(retried)
        XCTAssertEqual(fixture.relationships.events, ["didCancel:u-bob", "didSend:u-bob:req-1", "didCancel:u-bob"])
        XCTAssertEqual(fixture.social.deleteCalls, ["req-1", "req-1"])
    }

    // MARK: - Les mots

    func test_chaqueActionRateeDitCeQuiNEstPasParti() {
        let titles = ProfileRelationMutation.allCases.map { ProfileRelationFailureCopy.title(of: $0) }
        let consequences = ProfileRelationMutation.allCases.map { ProfileRelationFailureCopy.consequence(of: $0) }

        XCTAssertEqual(Set(titles).count, ProfileRelationMutation.allCases.count)
        XCTAssertFalse(titles.contains(where: \.isEmpty))
        XCTAssertFalse(consequences.contains(where: \.isEmpty))
        XCTAssertFalse(ProfileRelationFailureCopy.retry.isEmpty)
    }
}
