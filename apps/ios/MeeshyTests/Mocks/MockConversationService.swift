import Foundation
import MeeshySDK
import XCTest

final class MockConversationService: ConversationServiceProviding, @unchecked Sendable {

    // MARK: - Stubbing

    var listResult: Result<OffsetPaginatedAPIResponse<[APIConversation]>, Error> = .success(
        JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"error":null}
        """)
    )
    var listPageResult: Result<ConversationPage, Error> = .success(
        ConversationPage(items: [], nextCursor: nil, hasMore: false)
    )
    var getByIdResult: Result<APIConversation, Error> = .success(
        JSONStub.decode("""
        {"id":"000000000000000000000001","type":"direct","createdAt":"2026-01-01T00:00:00.000Z"}
        """)
    )
    var createResult: Result<CreateConversationResponse, Error> = .success(
        JSONStub.decode("""
        {"id":"000000000000000000000001","type":"direct","title":null,"createdAt":"2026-01-01T00:00:00.000Z"}
        """)
    )
    var deleteResult: Result<Void, Error> = .success(())
    var markReadResult: Result<Void, Error> = .success(())
    var markAsReceivedResult: Result<Void, Error> = .success(())
    var markUnreadResult: Result<Void, Error> = .success(())
    var getParticipantsResult: Result<PaginatedAPIResponse<[APIParticipant]>, Error> = .success(
        PaginatedAPIResponse(success: true, data: [], pagination: nil, error: nil)
    )
    var deleteForMeResult: Result<Void, Error> = .success(())
    var removeParticipantResult: Result<Void, Error> = .success(())
    var updateParticipantRoleResult: Result<Void, Error> = .success(())
    var listSharedWithResult: Result<[APIConversation], Error> = .success(
        JSONStub.decode("[]")
    )
    var updateResult: Result<APIConversation, Error> = .success(
        JSONStub.decode("""
        {"id":"000000000000000000000001","type":"group","createdAt":"2026-01-01T00:00:00.000Z"}
        """)
    )

    // MARK: - Call Tracking

    var listCallCount = 0
    var lastListOffset: Int?
    var lastListLimit: Int?

    var listPageCallCount = 0
    var lastListPageCursor: String?
    var lastListPageLimit: Int?
    var lastListPageCurrentUserId: String?
    /// Optional injection point for tests that need a different page on
    /// each call (e.g. drive a 3-page scroll). When set it takes
    /// precedence over `listPageResult` and is invoked with the cursor
    /// the ViewModel passed in.
    var listPageHandler: (@Sendable (String?) -> Result<ConversationPage, Error>)?
    /// Artificial latency before listPage returns — lets concurrency tests
    /// guarantee that two calls actually overlap instead of racing the
    /// instant-return mock (the in-flight guard only coalesces overlap).
    var listPageDelayNanoseconds: UInt64 = 0

    var getByIdCallCount = 0
    var lastGetByIdConversationId: String?

    var createCallCount = 0
    var lastCreateType: String?
    var lastCreateTitle: String?
    var lastCreateParticipantIds: [String]?

    var deleteCallCount = 0
    var lastDeleteConversationId: String?

    var markReadCallCount = 0
    var lastMarkReadConversationId: String?
    var onMarkReadCalled: (() -> Void)?

    var markAsReceivedCallCount = 0
    var lastMarkAsReceivedConversationId: String?

    var markUnreadCallCount = 0
    var lastMarkUnreadConversationId: String?

    var getParticipantsCallCount = 0
    var lastGetParticipantsConversationId: String?
    var lastGetParticipantsLimit: Int?

    var deleteForMeCallCount = 0
    var lastDeleteForMeConversationId: String?

    var removeParticipantCallCount = 0
    var lastRemoveParticipantConversationId: String?
    var lastRemoveParticipantParticipantId: String?

    var updateParticipantRoleCallCount = 0
    var lastUpdateParticipantRoleConversationId: String?
    var lastUpdateParticipantRoleParticipantId: String?
    var lastUpdateParticipantRoleRole: String?

    var listSharedWithCallCount = 0
    var lastListSharedWithUserId: String?
    var lastListSharedWithLimit: Int?

    var updateCallCount = 0
    var lastUpdateConversationId: String?
    var lastUpdateTitle: String?
    var lastUpdateDescription: String?
    var lastUpdateAvatar: String?
    var lastUpdateBanner: String?
    var lastUpdateDefaultWriteRole: String?
    var lastUpdateIsAnnouncementChannel: Bool?
    var lastUpdateSlowModeSeconds: Int?
    var lastUpdateAutoTranslateEnabled: Bool?

    var leaveCallCount = 0
    var lastLeaveConversationId: String?
    var leaveResult: Result<Void, Error> = .success(())

    var banParticipantCallCount = 0
    var lastBanParticipantConversationId: String?
    var lastBanParticipantUserId: String?
    var banParticipantResult: Result<Void, Error> = .success(())

    var unbanParticipantCallCount = 0
    var lastUnbanParticipantConversationId: String?
    var lastUnbanParticipantUserId: String?
    var unbanParticipantResult: Result<Void, Error> = .success(())

    // MARK: - Protocol Conformance

    nonisolated func list(offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[APIConversation]> {
        await MainActor.run {
            listCallCount += 1
            lastListOffset = offset
            lastListLimit = limit
        }
        return try listResult.get()
    }

    nonisolated func listPage(before cursor: String?, limit: Int, currentUserId: String) async throws -> ConversationPage {
        let handler = await MainActor.run { listPageHandler }
        let delay = await MainActor.run { listPageDelayNanoseconds }
        await MainActor.run {
            listPageCallCount += 1
            lastListPageCursor = cursor
            lastListPageLimit = limit
            lastListPageCurrentUserId = currentUserId
        }
        if delay > 0 { try? await Task.sleep(nanoseconds: delay) }
        if let handler {
            return try handler(cursor).get()
        }
        return try listPageResult.get()
    }

    nonisolated func getById(_ conversationId: String) async throws -> APIConversation {
        await MainActor.run {
            getByIdCallCount += 1
            lastGetByIdConversationId = conversationId
        }
        return try getByIdResult.get()
    }

    nonisolated func create(type: String, title: String?, participantIds: [String]) async throws -> CreateConversationResponse {
        await MainActor.run {
            createCallCount += 1
            lastCreateType = type
            lastCreateTitle = title
            lastCreateParticipantIds = participantIds
        }
        return try createResult.get()
    }

    nonisolated func delete(conversationId: String) async throws {
        await MainActor.run {
            deleteCallCount += 1
            lastDeleteConversationId = conversationId
        }
        try deleteResult.get()
    }

    nonisolated func markRead(conversationId: String) async throws {
        await MainActor.run {
            markReadCallCount += 1
            lastMarkReadConversationId = conversationId
            onMarkReadCalled?()
        }
        try markReadResult.get()
    }

    nonisolated func markAsReceived(conversationId: String) async throws {
        await MainActor.run {
            markAsReceivedCallCount += 1
            lastMarkAsReceivedConversationId = conversationId
        }
        try markAsReceivedResult.get()
    }

    nonisolated func markUnread(conversationId: String) async throws {
        await MainActor.run {
            markUnreadCallCount += 1
            lastMarkUnreadConversationId = conversationId
        }
        try markUnreadResult.get()
    }

    nonisolated func getParticipants(conversationId: String, limit: Int, cursor: String?) async throws -> PaginatedAPIResponse<[APIParticipant]> {
        await MainActor.run {
            getParticipantsCallCount += 1
            lastGetParticipantsConversationId = conversationId
            lastGetParticipantsLimit = limit
        }
        return try getParticipantsResult.get()
    }

    nonisolated func deleteForMe(conversationId: String) async throws {
        await MainActor.run {
            deleteForMeCallCount += 1
            lastDeleteForMeConversationId = conversationId
        }
        try deleteForMeResult.get()
    }

    nonisolated func findDirectWith(userId: String) async throws -> APIConversation? {
        nil
    }

    nonisolated func removeParticipant(conversationId: String, participantId: String) async throws {
        await MainActor.run {
            removeParticipantCallCount += 1
            lastRemoveParticipantConversationId = conversationId
            lastRemoveParticipantParticipantId = participantId
        }
        try removeParticipantResult.get()
    }

    nonisolated func updateParticipantRole(conversationId: String, participantId: String, role: String) async throws {
        await MainActor.run {
            updateParticipantRoleCallCount += 1
            lastUpdateParticipantRoleConversationId = conversationId
            lastUpdateParticipantRoleParticipantId = participantId
            lastUpdateParticipantRoleRole = role
        }
        try updateParticipantRoleResult.get()
    }

    nonisolated func listSharedWith(userId: String, limit: Int) async throws -> [APIConversation] {
        await MainActor.run {
            listSharedWithCallCount += 1
            lastListSharedWithUserId = userId
            lastListSharedWithLimit = limit
        }
        return try listSharedWithResult.get()
    }

    nonisolated func update(conversationId: String, title: String?, description: String?, avatar: String?, banner: String?, defaultWriteRole: String?, isAnnouncementChannel: Bool?, slowModeSeconds: Int?, autoTranslateEnabled: Bool?) async throws -> APIConversation {
        await MainActor.run {
            updateCallCount += 1
            lastUpdateConversationId = conversationId
            lastUpdateTitle = title
            lastUpdateDescription = description
            lastUpdateAvatar = avatar
            lastUpdateBanner = banner
            lastUpdateDefaultWriteRole = defaultWriteRole
            lastUpdateIsAnnouncementChannel = isAnnouncementChannel
            lastUpdateSlowModeSeconds = slowModeSeconds
            lastUpdateAutoTranslateEnabled = autoTranslateEnabled
        }
        return try updateResult.get()
    }

    nonisolated func leave(conversationId: String) async throws {
        await MainActor.run {
            leaveCallCount += 1
            lastLeaveConversationId = conversationId
        }
        try leaveResult.get()
    }

    nonisolated func banParticipant(conversationId: String, userId: String) async throws {
        await MainActor.run {
            banParticipantCallCount += 1
            lastBanParticipantConversationId = conversationId
            lastBanParticipantUserId = userId
        }
        try banParticipantResult.get()
    }

    nonisolated func unbanParticipant(conversationId: String, userId: String) async throws {
        await MainActor.run {
            unbanParticipantCallCount += 1
            lastUnbanParticipantConversationId = conversationId
            lastUnbanParticipantUserId = userId
        }
        try unbanParticipantResult.get()
    }

    // MARK: - Reset

    func reset() {
        listCallCount = 0
        lastListOffset = nil
        lastListLimit = nil
        listPageCallCount = 0
        lastListPageCursor = nil
        lastListPageLimit = nil
        lastListPageCurrentUserId = nil
        listPageHandler = nil
        listPageDelayNanoseconds = 0
        getByIdCallCount = 0
        lastGetByIdConversationId = nil
        createCallCount = 0
        lastCreateType = nil
        lastCreateTitle = nil
        lastCreateParticipantIds = nil
        deleteCallCount = 0
        lastDeleteConversationId = nil
        markReadCallCount = 0
        lastMarkReadConversationId = nil
        markAsReceivedCallCount = 0
        lastMarkAsReceivedConversationId = nil
        markUnreadCallCount = 0
        lastMarkUnreadConversationId = nil
        getParticipantsCallCount = 0
        lastGetParticipantsConversationId = nil
        lastGetParticipantsLimit = nil
        deleteForMeCallCount = 0
        lastDeleteForMeConversationId = nil
        removeParticipantCallCount = 0
        lastRemoveParticipantConversationId = nil
        lastRemoveParticipantParticipantId = nil
        updateParticipantRoleCallCount = 0
        lastUpdateParticipantRoleConversationId = nil
        lastUpdateParticipantRoleParticipantId = nil
        lastUpdateParticipantRoleRole = nil
        listSharedWithCallCount = 0
        lastListSharedWithUserId = nil
        lastListSharedWithLimit = nil
        updateCallCount = 0
        lastUpdateConversationId = nil
        lastUpdateTitle = nil
        lastUpdateDescription = nil
        lastUpdateAvatar = nil
        lastUpdateBanner = nil
        lastUpdateDefaultWriteRole = nil
        lastUpdateIsAnnouncementChannel = nil
        lastUpdateSlowModeSeconds = nil
        lastUpdateAutoTranslateEnabled = nil
        leaveCallCount = 0
        lastLeaveConversationId = nil
        banParticipantCallCount = 0
        lastBanParticipantConversationId = nil
        lastBanParticipantUserId = nil
        unbanParticipantCallCount = 0
        lastUnbanParticipantConversationId = nil
        lastUnbanParticipantUserId = nil
    }
}
