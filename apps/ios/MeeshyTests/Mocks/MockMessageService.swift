import Foundation
import MeeshySDK
import XCTest

@MainActor
final class MockMessageService: MessageServiceProviding {
    nonisolated init() {}

    // MARK: - Stubbing

    var listResult: Result<MessagesAPIResponse, Error> = .success(
        JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"cursorPagination":null,"hasNewer":null}
        """)
    )
    var listBeforeResult: Result<MessagesAPIResponse, Error> = .success(
        JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"cursorPagination":null,"hasNewer":null}
        """)
    )
    var listAroundResult: Result<MessagesAPIResponse, Error> = .success(
        JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"cursorPagination":null,"hasNewer":null}
        """)
    )
    var sendResult: Result<SendMessageResponseData, Error> = .success(
        JSONStub.decode("""
        {"id":"000000000000000000000001","conversationId":"000000000000000000000002","senderId":null,"content":"","messageType":null,"createdAt":"2026-01-01T00:00:00.000Z"}
        """)
    )
    var editResult: Result<APIMessage, Error> = .success(
        JSONStub.decode("""
        {"id":"000000000000000000000001","conversationId":"000000000000000000000002","createdAt":"2026-01-01T00:00:00.000Z"}
        """)
    )
    var deleteResult: Result<Void, Error> = .success(())
    var pinResult: Result<Void, Error> = .success(())
    var unpinResult: Result<Void, Error> = .success(())
    var consumeViewOnceResult: Result<ConsumeViewOnceResponse, Error> = .success(
        JSONStub.decode("""
        {"messageId":"000000000000000000000001","viewOnceCount":1,"maxViewOnceCount":1,"isFullyConsumed":true}
        """)
    )
    var searchResult: Result<MessagesAPIResponse, Error> = .success(
        JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"cursorPagination":null,"hasNewer":null}
        """)
    )
    var searchWithCursorResult: Result<MessagesAPIResponse, Error> = .success(
        JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"cursorPagination":null,"hasNewer":null}
        """)
    )

    // MARK: - Call Tracking

    var listCallCount = 0
    var lastListConversationId: String?
    var lastListOffset: Int?
    var lastListLimit: Int?
    var lastListIncludeReplies: Bool?

    var listBeforeCallCount = 0
    var lastListBeforeConversationId: String?
    var lastListBeforeCursor: String?

    var listAroundCallCount = 0
    var lastListAroundConversationId: String?
    var lastListAroundMessageId: String?

    var sendCallCount = 0
    var lastSendConversationId: String?
    var lastSendRequest: SendMessageRequest?

    var editCallCount = 0
    var lastEditMessageId: String?
    var lastEditContent: String?

    var deleteCallCount = 0
    var lastDeleteConversationId: String?
    var lastDeleteMessageId: String?

    var pinCallCount = 0
    var lastPinConversationId: String?
    var lastPinMessageId: String?

    var unpinCallCount = 0
    var lastUnpinConversationId: String?
    var lastUnpinMessageId: String?

    var consumeViewOnceCallCount = 0
    var lastConsumeViewOnceConversationId: String?
    var lastConsumeViewOnceMessageId: String?

    var searchCallCount = 0
    var lastSearchConversationId: String?
    var lastSearchQuery: String?
    var lastSearchLimit: Int?

    var searchWithCursorCallCount = 0
    var lastSearchWithCursorConversationId: String?
    var lastSearchWithCursorQuery: String?
    var lastSearchWithCursorCursor: String?

    // MARK: - Protocol Conformance

    nonisolated func list(conversationId: String, offset: Int, limit: Int, includeReplies: Bool) async throws -> MessagesAPIResponse {
        await MainActor.run {
            listCallCount += 1
            lastListConversationId = conversationId
            lastListOffset = offset
            lastListLimit = limit
            lastListIncludeReplies = includeReplies
        }
        return try await MainActor.run { try listResult.get() }
    }

    nonisolated func listBefore(conversationId: String, before: String, limit: Int, includeReplies: Bool) async throws -> MessagesAPIResponse {
        await MainActor.run {
            listBeforeCallCount += 1
            lastListBeforeConversationId = conversationId
            lastListBeforeCursor = before
        }
        return try await MainActor.run { try listBeforeResult.get() }
    }

    nonisolated func listAround(conversationId: String, around: String, limit: Int, includeReplies: Bool) async throws -> MessagesAPIResponse {
        await MainActor.run {
            listAroundCallCount += 1
            lastListAroundConversationId = conversationId
            lastListAroundMessageId = around
        }
        return try await MainActor.run { try listAroundResult.get() }
    }

    nonisolated func send(conversationId: String, request: SendMessageRequest) async throws -> SendMessageResponseData {
        await MainActor.run {
            sendCallCount += 1
            lastSendConversationId = conversationId
            lastSendRequest = request
        }
        return try await MainActor.run { try sendResult.get() }
    }

    nonisolated func edit(messageId: String, content: String) async throws -> APIMessage {
        await MainActor.run {
            editCallCount += 1
            lastEditMessageId = messageId
            lastEditContent = content
        }
        return try await MainActor.run { try editResult.get() }
    }

    nonisolated func delete(conversationId: String, messageId: String) async throws {
        await MainActor.run {
            deleteCallCount += 1
            lastDeleteConversationId = conversationId
            lastDeleteMessageId = messageId
        }
        try await MainActor.run { try deleteResult.get() }
    }

    nonisolated func pin(conversationId: String, messageId: String) async throws {
        await MainActor.run {
            pinCallCount += 1
            lastPinConversationId = conversationId
            lastPinMessageId = messageId
        }
        try await MainActor.run { try pinResult.get() }
    }

    nonisolated func unpin(conversationId: String, messageId: String) async throws {
        await MainActor.run {
            unpinCallCount += 1
            lastUnpinConversationId = conversationId
            lastUnpinMessageId = messageId
        }
        try await MainActor.run { try unpinResult.get() }
    }

    nonisolated func consumeViewOnce(conversationId: String, messageId: String) async throws -> ConsumeViewOnceResponse {
        await MainActor.run {
            consumeViewOnceCallCount += 1
            lastConsumeViewOnceConversationId = conversationId
            lastConsumeViewOnceMessageId = messageId
        }
        return try await MainActor.run { try consumeViewOnceResult.get() }
    }

    nonisolated func search(conversationId: String, query: String, limit: Int) async throws -> MessagesAPIResponse {
        await MainActor.run {
            searchCallCount += 1
            lastSearchConversationId = conversationId
            lastSearchQuery = query
            lastSearchLimit = limit
        }
        return try await MainActor.run { try searchResult.get() }
    }

    nonisolated func searchWithCursor(conversationId: String, query: String, cursor: String) async throws -> MessagesAPIResponse {
        await MainActor.run {
            searchWithCursorCallCount += 1
            lastSearchWithCursorConversationId = conversationId
            lastSearchWithCursorQuery = query
            lastSearchWithCursorCursor = cursor
        }
        return try await MainActor.run { try searchWithCursorResult.get() }
    }

    // MARK: - Reset

    func reset() {
        listCallCount = 0
        lastListConversationId = nil
        lastListOffset = nil
        lastListLimit = nil
        lastListIncludeReplies = nil
        listBeforeCallCount = 0
        lastListBeforeConversationId = nil
        lastListBeforeCursor = nil
        listAroundCallCount = 0
        lastListAroundConversationId = nil
        lastListAroundMessageId = nil
        sendCallCount = 0
        lastSendConversationId = nil
        lastSendRequest = nil
        editCallCount = 0
        lastEditMessageId = nil
        lastEditContent = nil
        deleteCallCount = 0
        lastDeleteConversationId = nil
        lastDeleteMessageId = nil
        pinCallCount = 0
        lastPinConversationId = nil
        lastPinMessageId = nil
        unpinCallCount = 0
        lastUnpinConversationId = nil
        lastUnpinMessageId = nil
        consumeViewOnceCallCount = 0
        lastConsumeViewOnceConversationId = nil
        lastConsumeViewOnceMessageId = nil
        searchCallCount = 0
        lastSearchConversationId = nil
        lastSearchQuery = nil
        lastSearchLimit = nil
        searchWithCursorCallCount = 0
        lastSearchWithCursorConversationId = nil
        lastSearchWithCursorQuery = nil
        lastSearchWithCursorCursor = nil
    }
}
