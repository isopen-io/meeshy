import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class CommunitySettingsViewModelTests: XCTestCase {

    private func makeSUT(service: MockCommunityService = MockCommunityService(), isPrivate: Bool = true) -> CommunitySettingsViewModel {
        let community = MeeshyCommunity(id: "c-settings-test", identifier: "mshy_x", name: "Alpha", isPrivate: isPrivate, createdBy: "u-creator")
        return CommunitySettingsViewModel(community: community, service: service, currentUserId: { "u-creator" })
    }

    func test_init_createurDeLaCommunaute_estCreateur() {
        XCTAssertTrue(makeSUT().isCreator)
    }

    func test_hasChanges_faux_puisVraiApresRenommage() {
        let sut = makeSUT()
        XCTAssertFalse(sut.hasChanges)

        sut.name = "Beta"

        XCTAssertTrue(sut.hasChanges)
    }

    func test_save_appelleUpdate_avecLeSeulChampModifie() async {
        let service = MockCommunityService()
        let sut = makeSUT(service: service)
        sut.name = "Beta"

        let updated = await sut.save()

        XCTAssertNotNil(updated)
        XCTAssertEqual(service.updateCallCount, 1)
        XCTAssertEqual(service.lastUpdateName, "Beta")
        UserDefaults.standard.removeObject(forKey: "community.color.c-settings-test")
        UserDefaults.standard.removeObject(forKey: "community.emoji.c-settings-test")
    }

    func test_save_echec_afficheLErreur() async {
        let service = MockCommunityService()
        service.updateResult = .failure(MeeshyError.server(statusCode: 403, message: "non"))
        let sut = makeSUT(service: service)

        let updated = await sut.save()

        XCTAssertNil(updated)
        XCTAssertTrue(sut.showError)
        XCTAssertFalse(sut.isSaving)
    }

    // MARK: - Rendre la communauté privée se confirme (#16787)

    func test_needsPrivacyConfirmation_publiqueRenduePrivee_vrai() {
        let sut = makeSUT(isPrivate: false)
        XCTAssertFalse(sut.needsPrivacyConfirmation)

        sut.isPrivate = true

        XCTAssertTrue(sut.needsPrivacyConfirmation)
    }

    func test_needsPrivacyConfirmation_priveeRouverteOuAutreChangement_faux() {
        let privee = makeSUT(isPrivate: true)
        privee.isPrivate = false
        XCTAssertFalse(privee.needsPrivacyConfirmation)

        let publique = makeSUT(isPrivate: false)
        publique.name = "Beta"
        XCTAssertFalse(publique.needsPrivacyConfirmation)
    }

    func test_showPrivacyConfirm_fermeParDefaut() {
        XCTAssertFalse(makeSUT(isPrivate: false).showPrivacyConfirm)
    }
}
