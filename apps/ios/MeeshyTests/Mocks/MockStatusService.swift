import Foundation
import MeeshySDK
import XCTest

private let emptyPaginatedPosts: PaginatedAPIResponse<[APIPost]> = JSONStub.decode("""
{"success":true,"data":[],"pagination":null,"error":null}
""")

private let stubStatusPost: APIPost = JSONStub.decode("""
{"id":"status-stub","type":"STATUS","content":"stub","moodEmoji":"\u{1F60A}","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"stub"}}
""")

@MainActor
final class MockStatusService: StatusServiceProviding {
    nonisolated init() {}

    // MARK: - Stubbing

    var listResult: Result<PaginatedAPIResponse<[APIPost]>, Error> = .success(emptyPaginatedPosts)
    var createResult: Result<APIPost, Error> = .success(stubStatusPost)
    var deleteResult: Result<Void, Error> = .success(())
    var reactResult: Result<Void, Error> = .success(())

    // MARK: - Call Tracking

    var listCallCount = 0
    var lastListMode: StatusService.Mode?
    var lastListCursor: String?
    var lastListLimit: Int?

    var createCallCount = 0
    var lastCreateMoodEmoji: String?
    var lastCreateContent: String?
    var lastCreateVisibility: String?
    var lastCreateVisibilityUserIds: [String]?
    var lastCreateViaUsername: String?

    var deleteCallCount = 0
    var lastDeleteStatusId: String?

    var reactCallCount = 0
    var lastReactStatusId: String?
    var lastReactEmoji: String?

    // MARK: - Protocol Conformance

    func list(mode: StatusService.Mode, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]> {
        listCallCount += 1
        lastListMode = mode
        lastListCursor = cursor
        lastListLimit = limit
        return try listResult.get()
    }

    func create(moodEmoji: String, content: String?, visibility: String,
                visibilityUserIds: [String]?, viaUsername: String? = nil) async throws -> APIPost {
        createCallCount += 1
        lastCreateMoodEmoji = moodEmoji
        lastCreateContent = content
        lastCreateVisibility = visibility
        lastCreateVisibilityUserIds = visibilityUserIds
        lastCreateViaUsername = viaUsername
        return try createResult.get()
    }

    func delete(statusId: String) async throws {
        deleteCallCount += 1
        lastDeleteStatusId = statusId
        try deleteResult.get()
    }

    func react(statusId: String, emoji: String) async throws {
        reactCallCount += 1
        lastReactStatusId = statusId
        lastReactEmoji = emoji
        try reactResult.get()
    }

    // MARK: - Reset

    func reset() {
        listResult = .success(emptyPaginatedPosts)
        listCallCount = 0
        lastListMode = nil
        lastListCursor = nil
        lastListLimit = nil

        createResult = .success(stubStatusPost)
        createCallCount = 0
        lastCreateMoodEmoji = nil
        lastCreateContent = nil
        lastCreateVisibility = nil
        lastCreateVisibilityUserIds = nil

        deleteResult = .success(())
        deleteCallCount = 0
        lastDeleteStatusId = nil

        reactResult = .success(())
        reactCallCount = 0
        lastReactStatusId = nil
        lastReactEmoji = nil
    }
}
