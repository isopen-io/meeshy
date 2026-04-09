import Foundation
import MeeshySDK
import XCTest

@MainActor
final class MockConversationService: ConversationServiceProviding {
    nonisolated init() {}

    // MARK: - Stubbing

    var listResult: Result<OffsetPaginatedAPIResponse<[APIConversation]>, Error> = .success(
        JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"error":null}
        """)
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
        return try await MainActor.run { try listResult.get() }
    }

    nonisolated func getById(_ conversationId: String) async throws -> APIConversation {
        await MainActor.run {
            getByIdCallCount += 1
            lastGetByIdConversationId = conversationId
        }
        return try await MainActor.run { try getByIdResult.get() }
    }

    nonisolated func create(type: String, title: String?, participantIds: [String]) async throws -> CreateConversationResponse {
        await MainActor.run {
            createCallCount += 1
            lastCreateType = type
            lastCreateTitle = title
            lastCreateParticipantIds = participantIds
        }
        return try await MainActor.run { try createResult.get() }
    }

    nonisolated func delete(conversationId: String) async throws {
        await MainActor.run {
            deleteCallCount += 1
            lastDeleteConversationId = conversationId
        }
        try await MainActor.run { try deleteResult.get() }
    }

    nonisolated func markRead(conversationId: String) async throws {
        await MainActor.run {
            markReadCallCount += 1
            lastMarkReadConversationId = conversationId
            onMarkReadCalled?()
        }
        try await MainActor.run { try markReadResult.get() }
    }

    nonisolated func markUnread(conversationId: String) async throws {
        await MainActor.run {
            markUnreadCallCount += 1
            lastMarkUnreadConversationId = conversationId
        }
        try await MainActor.run { try markUnreadResult.get() }
    }

    nonisolated func getParticipants(conversationId: String, limit: Int, cursor: String?) async throws -> PaginatedAPIResponse<[APIParticipant]> {
        await MainActor.run {
            getParticipantsCallCount += 1
            lastGetParticipantsConversationId = conversationId
            lastGetParticipantsLimit = limit
        }
        return try await MainActor.run { try getParticipantsResult.get() }
    }

    nonisolated func deleteForMe(conversationId: String) async throws {
        await MainActor.run {
            deleteForMeCallCount += 1
            lastDeleteForMeConversationId = conversationId
        }
        try await MainActor.run { try deleteForMeResult.get() }
    }

    nonisolated func removeParticipant(conversationId: String, participantId: String) async throws {
        await MainActor.run {
            removeParticipantCallCount += 1
            lastRemoveParticipantConversationId = conversationId
            lastRemoveParticipantParticipantId = participantId
        }
        try await MainActor.run { try removeParticipantResult.get() }
    }

    nonisolated func updateParticipantRole(conversationId: String, participantId: String, role: String) async throws {
        await MainActor.run {
            updateParticipantRoleCallCount += 1
            lastUpdateParticipantRoleConversationId = conversationId
            lastUpdateParticipantRoleParticipantId = participantId
            lastUpdateParticipantRoleRole = role
        }
        try await MainActor.run { try updateParticipantRoleResult.get() }
    }

    nonisolated func listSharedWith(userId: String, limit: Int) async throws -> [APIConversation] {
        await MainActor.run {
            listSharedWithCallCount += 1
            lastListSharedWithUserId = userId
            lastListSharedWithLimit = limit
        }
        return try await MainActor.run { try listSharedWithResult.get() }
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
        return try await MainActor.run { try updateResult.get() }
    }

    nonisolated func leave(conversationId: String) async throws {
        await MainActor.run {
            leaveCallCount += 1
            lastLeaveConversationId = conversationId
        }
        try await MainActor.run { try leaveResult.get() }
    }

    nonisolated func banParticipant(conversationId: String, userId: String) async throws {
        await MainActor.run {
            banParticipantCallCount += 1
            lastBanParticipantConversationId = conversationId
            lastBanParticipantUserId = userId
        }
        try await MainActor.run { try banParticipantResult.get() }
    }

    nonisolated func unbanParticipant(conversationId: String, userId: String) async throws {
        await MainActor.run {
            unbanParticipantCallCount += 1
            lastUnbanParticipantConversationId = conversationId
            lastUnbanParticipantUserId = userId
        }
        try await MainActor.run { try unbanParticipantResult.get() }
    }

    // MARK: - Reset

    func reset() {
        listCallCount = 0
        lastListOffset = nil
        lastListLimit = nil
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
