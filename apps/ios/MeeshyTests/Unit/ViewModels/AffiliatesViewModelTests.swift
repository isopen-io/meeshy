import XCTest
@testable import Meeshy
import MeeshySDK

/// Affiliés — la liste des filleuls dans l'annuaire.
@MainActor
final class AffiliatesViewModelTests: XCTestCase {

    private func makeReferral(
        id: String = "rel-1",
        userId: String = "u1",
        username: String = "awa",
        firstName: String? = "Awa",
        lastName: String? = "Diallo"
    ) -> AffiliateReferral {
        AffiliateReferral(
            id: id,
            status: "completed",
            referredUser: ReferredUser(id: userId, username: username, firstName: firstName, lastName: lastName)
        )
    }

    private func makeSUT(
        referrals: [AffiliateReferral]? = [],
        statsError: Error? = nil
    ) -> (sut: AffiliatesViewModel, service: MockAffiliateService, creator: MockConversationCreator) {
        let service = MockAffiliateService()
        service.fetchStatsResult = statsError.map { .failure($0) }
            ?? .success(AffiliateStats(totalReferrals: referrals?.count, referrals: referrals))
        let creator = MockConversationCreator()
        let sut = AffiliatesViewModel(
            affiliateService: service,
            conversationCreator: creator,
            currentUserId: "me"
        )
        return (sut, service, creator)
    }

    func test_load_populatesReferralsFromStats() async {
        let (sut, service, _) = makeSUT(referrals: [makeReferral()])

        await sut.load(forceNetwork: true)

        XCTAssertEqual(sut.referrals.count, 1)
        XCTAssertEqual(sut.loadState, .loaded)
        XCTAssertEqual(service.fetchStatsCallCount, 1)
    }

    func test_load_statsWithoutReferrals_yieldsAnEmptyList() async {
        // Le champ est optionnel côté API : son absence n'est pas une erreur.
        let (sut, _, _) = makeSUT(referrals: nil)

        await sut.load(forceNetwork: true)

        XCTAssertTrue(sut.referrals.isEmpty)
        XCTAssertEqual(sut.loadState, .loaded)
    }

    func test_load_failureOnEmptyList_surfacesError() async {
        let (sut, _, _) = makeSUT(statsError: URLError(.notConnectedToInternet))

        await sut.load(forceNetwork: true)

        guard case .error = sut.loadState else {
            return XCTFail("Expected an error state, got \(sut.loadState)")
        }
    }

    func test_load_failureWithReferralsAlreadyShown_keepsThemVisible() async {
        let (sut, service, _) = makeSUT(referrals: [makeReferral()])
        await sut.load(forceNetwork: true)

        service.fetchStatsResult = .failure(URLError(.timedOut))
        await sut.load(forceNetwork: true)

        XCTAssertEqual(sut.referrals.count, 1)
        XCTAssertEqual(sut.loadState, .loaded)
    }

    func test_visibleReferrals_searchMatchesNameOrUsername() async {
        let (sut, _, _) = makeSUT(referrals: [
            makeReferral(id: "1", userId: "u1", username: "awa"),
            makeReferral(id: "2", userId: "u2", username: "bob", firstName: "Bob", lastName: "Marley"),
        ])
        await sut.load(forceNetwork: true)

        sut.searchQuery = "marley"

        XCTAssertEqual(sut.visibleReferrals.map(\.id), ["2"])
    }

    func test_startConversation_opensDirectConversationWithTheReferredUser() async {
        let (sut, _, creator) = makeSUT()

        let conversation = await sut.startConversation(with: makeReferral(userId: "u42"))

        XCTAssertNotNil(conversation)
        XCTAssertEqual(creator.lastUserId, "u42")
    }

    func test_startConversation_referralWithoutUser_doesNothing() async {
        let (sut, _, creator) = makeSUT()

        let conversation = await sut.startConversation(with: AffiliateReferral(id: "rel-x"))

        XCTAssertNil(conversation)
        XCTAssertEqual(creator.createCallCount, 0)
    }

    func test_resolvedName_fallsBackToTheHandleWhenNoNameIsKnown() {
        let referral = AffiliateReferral(
            id: "rel-1",
            referredUser: ReferredUser(id: "u1", username: "awa")
        )
        XCTAssertEqual(referral.resolvedName, "@awa")
    }
}
