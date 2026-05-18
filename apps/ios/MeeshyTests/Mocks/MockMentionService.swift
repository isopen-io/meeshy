import Foundation
import MeeshySDK
import XCTest

// MARK: - MockMentionService

final class MockMentionService: MentionServiceProviding, @unchecked Sendable {

    // MARK: - Stubbing

    var suggestionsResult: Result<[MentionSuggestion], Error> = .success([])

    // MARK: - Call Tracking

    var suggestionsCallCount = 0
    var lastContextId: String?
    var lastContextType: MentionContextType?
    var lastQuery: String?

    // MARK: - MentionServiceProviding

    func suggestions(
        contextId: String,
        contextType: MentionContextType,
        query: String
    ) async throws -> [MentionSuggestion] {
        suggestionsCallCount += 1
        lastContextId = contextId
        lastContextType = contextType
        lastQuery = query
        return try suggestionsResult.get()
    }

    @available(*, deprecated, renamed: "suggestions(contextId:contextType:query:)")
    func suggestions(conversationId: String, query: String) async throws -> [MentionSuggestion] {
        try await suggestions(contextId: conversationId, contextType: .conversation, query: query)
    }

    // MARK: - Reset

    func reset() {
        suggestionsCallCount = 0
        lastContextId = nil
        lastContextType = nil
        lastQuery = nil
        suggestionsResult = .success([])
    }
}
