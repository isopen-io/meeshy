import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class CommunityCreateViewModelTests: XCTestCase {

    func test_createCommunity_nomVide_neTouchePasLeReseau() async {
        let service = MockCommunityService()
        let sut = CommunityCreateViewModel(communityService: service, userService: MockUserService())

        let created = await sut.createCommunity()

        XCTAssertNil(created)
        XCTAssertEqual(service.createCallCount, 0)
    }

    func test_createCommunity_creeEtAjouteChaqueMembreSelectionne() async {
        let service = MockCommunityService()
        let sut = CommunityCreateViewModel(communityService: service, userService: MockUserService())
        sut.name = "Alpha"
        sut.selectedMembers = [UserSearchResult(id: "u1", username: "a"), UserSearchResult(id: "u2", username: "b")]

        let created = await sut.createCommunity()

        XCTAssertNotNil(created)
        XCTAssertEqual(service.createCallCount, 1)
        XCTAssertEqual(service.addMemberCallCount, sut.selectedMembers.count)
    }

    func test_createCommunity_echec_afficheLErreur() async {
        let service = MockCommunityService()
        service.createResult = .failure(MeeshyError.server(statusCode: 409, message: "pris"))
        let sut = CommunityCreateViewModel(communityService: service, userService: MockUserService())
        sut.name = "Alpha"

        let created = await sut.createCommunity()

        XCTAssertNil(created)
        XCTAssertTrue(sut.showError)
        XCTAssertEqual(sut.errorMessage, "pris")
    }

    private func isolatedDefaults() throws -> UserDefaults {
        let suite = "community-create-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }

    func test_createCommunity_emojiChoisi_seRetrouveDansLeDetail() async throws {
        let defaults = try isolatedDefaults()
        let service = MockCommunityService()
        service.createResult = .success(CommunityStubs.community(id: "c-emoji"))
        let sut = CommunityCreateViewModel(communityService: service, userService: MockUserService(), appearanceDefaults: defaults)
        sut.name = "Alpha"
        sut.selectedEmoji = "🚀"

        let created = await sut.createCommunity()

        XCTAssertEqual(created?.emoji, "🚀")
        XCTAssertEqual(CommunityLocalAppearance.read(communityId: "c-emoji", from: defaults).emoji, "🚀",
                       "Le détail relit l'emoji par CommunityLocalAppearance : la création doit l'y écrire.")
    }

    func test_createCommunity_sansEmoji_nEcritRien() async throws {
        let defaults = try isolatedDefaults()
        let service = MockCommunityService()
        service.createResult = .success(CommunityStubs.community(id: "c-plain"))
        let sut = CommunityCreateViewModel(communityService: service, userService: MockUserService(), appearanceDefaults: defaults)
        sut.name = "Alpha"

        let created = await sut.createCommunity()

        XCTAssertEqual(created?.emoji, "")
        XCTAssertNil(CommunityLocalAppearance.read(communityId: "c-plain", from: defaults).emoji)
    }

    func test_createCommunity_echec_nEcritPasDEmoji() async throws {
        let defaults = try isolatedDefaults()
        let service = MockCommunityService()
        service.createResult = .failure(MeeshyError.server(statusCode: 409, message: "pris"))
        let sut = CommunityCreateViewModel(communityService: service, userService: MockUserService(), appearanceDefaults: defaults)
        sut.name = "Alpha"
        sut.selectedEmoji = "🚀"

        _ = await sut.createCommunity()

        XCTAssertTrue(defaults.dictionaryRepresentation().keys.allSatisfy { !$0.hasPrefix("community.emoji.") })
    }
}
