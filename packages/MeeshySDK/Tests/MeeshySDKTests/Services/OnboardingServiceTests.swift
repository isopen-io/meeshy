import XCTest
@testable import MeeshySDK

/// L'onboarding post-inscription (#7729) se lit et s'écrit à UNE adresse,
/// `/me/onboarding`. Le serveur arbitre l'éligibilité et le régime protégé ;
/// le client ne fait qu'afficher ce qu'il déclare — et, quand la charge est
/// incomplète, il retombe du côté qui PROTÈGE.
final class OnboardingServiceTests: XCTestCase {

    private func makeSUT() -> (service: OnboardingService, api: MockAPIClient) {
        let api = MockAPIClient()
        return (OnboardingService(api: api), api)
    }

    private static let path = "/me/onboarding"

    private static func makeState(
        eligible: Bool = true,
        seenSteps: [OnboardingStepId] = [],
        protectedRegime: Bool = false
    ) -> APIOnboardingState {
        APIOnboardingState(
            eligible: eligible,
            completedAt: nil,
            seenSteps: seenSteps,
            prefilledSteps: [],
            globalConversationId: "000000000000000000000abc",
            protectedRegime: protectedRegime,
            storyDefaultVisibility: protectedRegime ? .friends : .public,
            suggestions: []
        )
    }

    // MARK: - Lecture

    func test_fetchState_readsTheSingleAddress() async throws {
        let (service, api) = makeSUT()
        let payload = Self.makeState()
        api.stub(Self.path, result: APIResponse<APIOnboardingState>(success: true, data: payload, error: nil))

        let state = try await service.fetchState()

        XCTAssertEqual(api.requestCount, 1)
        XCTAssertEqual(api.lastRequest?.endpoint, Self.path)
        XCTAssertEqual(api.lastRequest?.method, "GET")
        XCTAssertEqual(state, payload)
    }

    // MARK: - Écriture

    func test_record_stepDone_patchesStepAndOutcome() async throws {
        let (service, api) = makeSUT()
        api.stub(Self.path, result: APIResponse<APIOnboardingState>(success: true, data: Self.makeState(seenSteps: [.global]), error: nil))

        let state = try await service.record(step: .global, outcome: .done)

        XCTAssertEqual(api.lastRequest?.method, "PATCH")
        XCTAssertEqual(api.lastRequest?.bodyJSON?["step"] as? String, "global")
        XCTAssertEqual(api.lastRequest?.bodyJSON?["outcome"] as? String, "done")
        XCTAssertNil(api.lastRequest?.bodyJSON?["finish"])
        XCTAssertEqual(state.seenSteps, [.global])
    }

    func test_record_stepSkipped_sendsSkippedOutcome() async throws {
        let (service, api) = makeSUT()
        api.stub(Self.path, result: APIResponse<APIOnboardingState>(success: true, data: Self.makeState(), error: nil))

        _ = try await service.record(step: .friends, outcome: .skipped)

        XCTAssertEqual(api.lastRequest?.bodyJSON?["step"] as? String, "friends")
        XCTAssertEqual(api.lastRequest?.bodyJSON?["outcome"] as? String, "skipped")
    }

    func test_finish_patchesFinishTrueOnly() async throws {
        let (service, api) = makeSUT()
        api.stub(Self.path, result: APIResponse<APIOnboardingState>(success: true, data: Self.makeState(eligible: false), error: nil))

        let state = try await service.finish()

        XCTAssertEqual(api.lastRequest?.method, "PATCH")
        XCTAssertEqual(api.lastRequest?.bodyJSON?["finish"] as? Bool, true)
        XCTAssertNil(api.lastRequest?.bodyJSON?["step"])
        XCTAssertFalse(state.eligible)
    }

    // MARK: - Décodage du contrat

    func test_decode_exactGatewayShape() throws {
        let json = """
        {"eligible":true,"completedAt":null,"seenSteps":["languages"],"prefilledSteps":["story"],
         "globalConversationId":"66f1c0ffee0000000000abcd","protectedRegime":false,
         "storyDefaultVisibility":"public",
         "suggestions":[{"id":"u1","username":"nova_lina","displayName":"Lina","avatarUrl":null,"languages":["fr","es"]}]}
        """
        let state = try JSONDecoder().decode(APIOnboardingState.self, from: Data(json.utf8))

        XCTAssertTrue(state.eligible)
        XCTAssertNil(state.completedAt)
        XCTAssertEqual(state.seenSteps, [.languages])
        XCTAssertEqual(state.prefilledSteps, [.story])
        XCTAssertEqual(state.globalConversationId, "66f1c0ffee0000000000abcd")
        XCTAssertEqual(state.storyDefaultVisibility, .public)
        XCTAssertEqual(state.suggestions.first?.username, "nova_lina")
        XCTAssertNil(state.suggestions.first?.avatarUrl)
        XCTAssertEqual(state.suggestions.first?.languages, ["fr", "es"])
    }

    func test_decode_unknownStepId_isDroppedNeverAFailure() throws {
        let json = """
        {"eligible":true,"completedAt":null,"seenSteps":["languages","future_step"],"prefilledSteps":["later"],
         "globalConversationId":null,"protectedRegime":false,"storyDefaultVisibility":"public","suggestions":[]}
        """
        let state = try JSONDecoder().decode(APIOnboardingState.self, from: Data(json.utf8))

        XCTAssertEqual(state.seenSteps, [.languages])
        XCTAssertEqual(state.prefilledSteps, [])
    }

    func test_decode_missingProtectedRegime_failsClosedToProtected() throws {
        let json = """
        {"eligible":true,"completedAt":null,"seenSteps":[],"prefilledSteps":[],
         "globalConversationId":null,"suggestions":[]}
        """
        let state = try JSONDecoder().decode(APIOnboardingState.self, from: Data(json.utf8))

        XCTAssertTrue(state.protectedRegime)
        XCTAssertEqual(state.storyDefaultVisibility, .friends)
    }

    func test_decode_unknownVisibility_failsClosedToFriends() throws {
        let json = """
        {"eligible":true,"completedAt":null,"seenSteps":[],"prefilledSteps":[],
         "globalConversationId":null,"protectedRegime":false,"storyDefaultVisibility":"everyone","suggestions":[]}
        """
        let state = try JSONDecoder().decode(APIOnboardingState.self, from: Data(json.utf8))

        XCTAssertEqual(state.storyDefaultVisibility, .friends)
    }

    func test_decode_protectedRegime_forcesFriendsEvenIfServerSaysPublic() throws {
        let json = """
        {"eligible":true,"completedAt":null,"seenSteps":[],"prefilledSteps":[],
         "globalConversationId":null,"protectedRegime":true,"storyDefaultVisibility":"public","suggestions":[]}
        """
        let state = try JSONDecoder().decode(APIOnboardingState.self, from: Data(json.utf8))

        XCTAssertEqual(state.storyDefaultVisibility, .friends)
    }

    func test_decode_moreThanSixSuggestions_keepsOnlySix() throws {
        let suggestion = #"{"id":"u","username":"u","displayName":"U","avatarUrl":null,"languages":["en"]}"#
        let list = Array(repeating: suggestion, count: 9).joined(separator: ",")
        let json = """
        {"eligible":true,"completedAt":null,"seenSteps":[],"prefilledSteps":[],
         "globalConversationId":null,"protectedRegime":false,"storyDefaultVisibility":"public","suggestions":[\(list)]}
        """
        let state = try JSONDecoder().decode(APIOnboardingState.self, from: Data(json.utf8))

        XCTAssertEqual(state.suggestions.count, 6)
    }

    func test_stepOrder_isTheFiveCardsInContractOrder() {
        XCTAssertEqual(OnboardingStepId.allCases, [.languages, .global, .story, .friends, .notifications])
    }
}
