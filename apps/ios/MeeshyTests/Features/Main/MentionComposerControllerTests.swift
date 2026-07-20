import XCTest
@testable import Meeshy
import MeeshySDK

// MARK: - MentionComposerControllerTests

@MainActor
final class MentionComposerControllerTests: XCTestCase {

    // MARK: - Factory

    private func makeSUT(
        context: MentionComposerController.Context = .conversation(id: "conv-1"),
        localCandidates: [MentionCandidate] = [],
        service: MockMentionService = MockMentionService()
    ) -> (sut: MentionComposerController, mock: MockMentionService) {
        let mock = service
        let sut = MentionComposerController(
            context: context,
            localCandidates: { localCandidates },
            service: mock
        )
        return (sut, mock)
    }

    private func makeCandidate(
        id: String = "user-1",
        username: String = "alice",
        displayName: String = "Alice"
    ) -> MentionCandidate {
        MentionCandidate(id: id, username: username, displayName: displayName, avatarURL: nil)
    }

    private func makeSuggestion(
        id: String = "user-1",
        username: String = "alice",
        displayName: String = "Alice"
    ) -> MentionSuggestion {
        MentionSuggestion(
            id: id, username: username, displayName: displayName,
            avatar: nil, badge: nil, inConversation: nil, isFriend: nil
        )
    }

    // MARK: - handleQuery: activeQuery

    func test_handleQuery_withAtSymbol_setsActiveQuery() {
        let (sut, _) = makeSUT()

        sut.handleQuery(in: "Hello @ali")

        XCTAssertEqual(sut.activeQuery, "ali")
    }

    func test_handleQuery_withNoAtSymbol_doesNotSetActiveQuery() {
        let (sut, _) = makeSUT()

        sut.handleQuery(in: "Hello world")

        XCTAssertNil(sut.activeQuery)
    }

    func test_handleQuery_withAtSymbolFollowedBySpace_doesNotSetActiveQuery() {
        let (sut, _) = makeSUT()

        sut.handleQuery(in: "Hello @alice done")

        XCTAssertNil(sut.activeQuery)
    }

    // MARK: - handleQuery: clearsSuggestions

    func test_handleQuery_withoutAtSymbol_clearsSuggestions() {
        let candidate = makeCandidate()
        let (sut, _) = makeSUT(localCandidates: [candidate])
        sut.handleQuery(in: "@ali")
        XCTAssertFalse(sut.suggestions.isEmpty, "Precondition: suggestions populated")

        sut.handleQuery(in: "no mention here")

        XCTAssertTrue(sut.suggestions.isEmpty)
        XCTAssertNil(sut.activeQuery)
    }

    // MARK: - handleQuery: local candidates filter

    func test_handleQuery_short_filtersLocalCandidatesImmediately() {
        let alice = makeCandidate(id: "1", username: "alice", displayName: "Alice")
        let bob = makeCandidate(id: "2", username: "bob", displayName: "Bob")
        let (sut, _) = makeSUT(localCandidates: [alice, bob])

        sut.handleQuery(in: "@al")

        XCTAssertEqual(sut.suggestions.count, 1)
        XCTAssertEqual(sut.suggestions.first?.username, "alice")
    }

    func test_handleQuery_emptyQuery_returnsAllLocalCandidates() {
        let alice = makeCandidate(id: "1", username: "alice", displayName: "Alice")
        let bob = makeCandidate(id: "2", username: "bob", displayName: "Bob")
        let (sut, _) = makeSUT(localCandidates: [alice, bob])

        // "@" with no trailing text = empty query
        sut.handleQuery(in: "@")

        XCTAssertEqual(sut.suggestions.count, 2)
    }

    // MARK: - handleQuery: API debounce

    func test_handleQuery_long_triggersAPIFetchAfterDebounce() async {
        let mockService = MockMentionService()
        mockService.suggestionsResult = .success([makeSuggestion(username: "alicia")])
        let (sut, mock) = makeSUT(service: mockService)

        sut.handleQuery(in: "@ali")

        // Wait for debounce (300ms) + small buffer
        try? await Task.sleep(nanoseconds: 400_000_000)

        XCTAssertGreaterThanOrEqual(mock.suggestionsCallCount, 1)
        XCTAssertEqual(mock.lastQuery, "ali")
    }

    func test_handleQuery_emptyQuery_triggersAPIFetch_showsDefaultList() async {
        let mockService = MockMentionService()
        mockService.suggestionsResult = .success([makeSuggestion(username: "alicia")])
        let (sut, mock) = makeSUT(service: mockService)

        // Taper juste « @ » (requête vide) doit afficher la liste par défaut
        // (auteur du post + personnes ayant commenté + contacts) → appel API.
        sut.handleQuery(in: "Hey @")

        try? await Task.sleep(nanoseconds: 400_000_000)

        XCTAssertGreaterThanOrEqual(mock.suggestionsCallCount, 1)
        XCTAssertEqual(mock.lastQuery, "")
    }

    // MARK: - insertMention

    func test_insertMention_replacesActiveQueryWithUsername() {
        let candidate = makeCandidate(username: "alice")
        let (sut, _) = makeSUT()
        sut.handleQuery(in: "Hey @ali")

        let result = sut.insertMention(candidate, into: "Hey @ali")

        XCTAssertEqual(result, "Hey @alice ")
    }

    func test_insertMention_recordsInDraftMentions() {
        let candidate = makeCandidate(username: "alice")
        let (sut, _) = makeSUT()

        sut.insertMention(candidate, into: "@ali")

        XCTAssertNotNil(sut.draftMentions["alice"])
        XCTAssertEqual(sut.draftMentions["alice"]?.id, candidate.id)
    }

    func test_insertMention_clearsSuggestions() {
        let candidate = makeCandidate(username: "alice")
        let localAlice = makeCandidate(id: "1", username: "alice", displayName: "Alice")
        let (sut, _) = makeSUT(localCandidates: [localAlice])
        sut.handleQuery(in: "@ali")
        XCTAssertFalse(sut.suggestions.isEmpty, "Precondition: suggestions populated")

        sut.insertMention(candidate, into: "@ali")

        XCTAssertTrue(sut.suggestions.isEmpty)
        XCTAssertNil(sut.activeQuery)
    }

    // MARK: - clearDraft

    func test_clearDraft_emptiesDraftMentions() {
        let candidate = makeCandidate(username: "alice")
        let (sut, _) = makeSUT()
        sut.insertMention(candidate, into: "@ali")
        XCTAssertFalse(sut.draftMentions.isEmpty, "Precondition: draft has one mention")

        sut.clearDraft()

        XCTAssertTrue(sut.draftMentions.isEmpty)
    }

    // MARK: - Context: post

    func test_context_post_callsServiceWithPostContextType() async {
        let mockService = MockMentionService()
        mockService.suggestionsResult = .success([])
        let (sut, mock) = makeSUT(context: .post(id: "post-42"), service: mockService)

        sut.handleQuery(in: "@ali")
        try? await Task.sleep(nanoseconds: 400_000_000)

        XCTAssertEqual(mock.lastContextType, .post)
        XCTAssertEqual(mock.lastContextId, "post-42")
    }

    // MARK: - Context: conversation

    func test_context_conversation_callsServiceWithConversationContextType() async {
        let mockService = MockMentionService()
        mockService.suggestionsResult = .success([])
        let (sut, mock) = makeSUT(context: .conversation(id: "conv-99"), service: mockService)

        sut.handleQuery(in: "@ali")
        try? await Task.sleep(nanoseconds: 400_000_000)

        XCTAssertEqual(mock.lastContextType, .conversation)
        XCTAssertEqual(mock.lastContextId, "conv-99")
    }

    // MARK: - clearSuggestions

    func test_clearSuggestions_nilsActiveQueryAndEmptiesSuggestions() {
        let localAlice = makeCandidate(id: "1", username: "alice", displayName: "Alice")
        let (sut, _) = makeSUT(localCandidates: [localAlice])
        sut.handleQuery(in: "@ali")
        XCTAssertNotNil(sut.activeQuery, "Precondition")

        sut.clearSuggestions()

        XCTAssertNil(sut.activeQuery)
        XCTAssertTrue(sut.suggestions.isEmpty)
    }

    // MARK: - API merge: deduplication

    func test_handleQuery_long_mergesAPIResultsWithoutDuplicatingLocals() async {
        let localAlice = makeCandidate(id: "local-1", username: "alice", displayName: "Alice")
        let mockService = MockMentionService()
        // API returns alice (duplicate) + alicia (new)
        mockService.suggestionsResult = .success([
            makeSuggestion(id: "api-1", username: "alice"),
            makeSuggestion(id: "api-2", username: "alicia")
        ])
        let (sut, _) = makeSUT(localCandidates: [localAlice], service: mockService)

        sut.handleQuery(in: "@al")
        try? await Task.sleep(nanoseconds: 400_000_000)

        // Should have alice (local) + alicia (from API), not two alices
        XCTAssertEqual(sut.suggestions.count, 2)
        let usernames = sut.suggestions.map(\.username)
        XCTAssertEqual(usernames.filter { $0 == "alice" }.count, 1)
        XCTAssertTrue(usernames.contains("alicia"))
    }
}
