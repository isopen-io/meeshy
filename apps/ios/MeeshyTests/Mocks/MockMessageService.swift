import Foundation
import MeeshySDK
import XCTest

final class MockMessageService: MessageServiceProviding, @unchecked Sendable {

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
    var listAfterResult: Result<MessagesAPIResponse, Error> = .success(
        JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"cursorPagination":null,"hasNewer":null}
        """)
    )
    /// FIFO queue of per-call responses for `listAfter`, consumed before
    /// falling back to `listAfterResult`. Lets a test drive multi-page forward
    /// backfill (e.g. a full page then a partial page) to prove the watermark
    /// loop keeps paging past the first `limit` messages.
    var listAfterResults: [MessagesAPIResponse] = []
    var listAroundResult: Result<MessagesAPIResponse, Error> = .success(
        JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"cursorPagination":null,"hasNewer":null}
        """)
    )
    var sendResult: Result<SendMessageResponseData, Error> = .success(
        JSONStub.decode("""
        {"id":"000000000000000000000001","conversationId":"000000000000000000000002","senderId":"000000000000000000000099","content":"","messageType":null,"createdAt":"2026-01-01T00:00:00.000Z"}
        """)
    )
    var editResult: Result<APIMessage, Error> = .success(
        JSONStub.decode("""
        {"id":"000000000000000000000001","conversationId":"000000000000000000000002","senderId":"000000000000000000000099","createdAt":"2026-01-01T00:00:00.000Z"}
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
    var lastListIncludeTranslations: Bool?
    var lastListLanguages: [String]?

    var listBeforeCallCount = 0
    var lastListBeforeConversationId: String?
    var lastListBeforeCursor: String?
    var lastListBeforeLanguages: [String]?

    var listAfterCallCount = 0
    var lastListAfterConversationId: String?
    var lastListAfterAfter: Date?
    var lastListAfterLimit: Int?
    var lastListAfterLanguages: [String]?

    var listAroundCallCount = 0
    var lastListAroundConversationId: String?
    var lastListAroundMessageId: String?
    var lastListAroundLanguages: [String]?

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

    nonisolated func list(conversationId: String, offset: Int, limit: Int, includeReplies: Bool, includeTranslations: Bool, languages: [String]?) async throws -> MessagesAPIResponse {
        await MainActor.run {
            listCallCount += 1
            lastListConversationId = conversationId
            lastListOffset = offset
            lastListLimit = limit
            lastListIncludeReplies = includeReplies
            lastListIncludeTranslations = includeTranslations
            lastListLanguages = languages
        }
        return try listResult.get()
    }

    nonisolated func listBefore(conversationId: String, before: String, limit: Int, includeReplies: Bool, includeTranslations: Bool, languages: [String]?) async throws -> MessagesAPIResponse {
        await MainActor.run {
            listBeforeCallCount += 1
            lastListBeforeConversationId = conversationId
            lastListBeforeCursor = before
            lastListBeforeLanguages = languages
        }
        return try listBeforeResult.get()
    }

    nonisolated func listAfter(conversationId: String, after: Date, limit: Int, includeReplies: Bool, includeTranslations: Bool, languages: [String]?) async throws -> MessagesAPIResponse {
        try await MainActor.run {
            listAfterCallCount += 1
            lastListAfterConversationId = conversationId
            lastListAfterAfter = after
            lastListAfterLimit = limit
            lastListAfterLanguages = languages
            if !listAfterResults.isEmpty { return listAfterResults.removeFirst() }
            return try listAfterResult.get()
        }
    }

    nonisolated func listAround(conversationId: String, around: String, limit: Int, includeReplies: Bool, includeTranslations: Bool, languages: [String]?) async throws -> MessagesAPIResponse {
        await MainActor.run {
            listAroundCallCount += 1
            lastListAroundConversationId = conversationId
            lastListAroundMessageId = around
            lastListAroundLanguages = languages
        }
        return try listAroundResult.get()
    }

    nonisolated func send(conversationId: String, request: SendMessageRequest) async throws -> SendMessageResponseData {
        await MainActor.run {
            sendCallCount += 1
            lastSendConversationId = conversationId
            lastSendRequest = request
        }
        return try sendResult.get()
    }

    nonisolated func edit(messageId: String, content: String) async throws -> APIMessage {
        await MainActor.run {
            editCallCount += 1
            lastEditMessageId = messageId
            lastEditContent = content
        }
        return try editResult.get()
    }

    nonisolated func delete(conversationId: String, messageId: String) async throws {
        await MainActor.run {
            deleteCallCount += 1
            lastDeleteConversationId = conversationId
            lastDeleteMessageId = messageId
        }
        try deleteResult.get()
    }

    nonisolated func pin(conversationId: String, messageId: String) async throws {
        await MainActor.run {
            pinCallCount += 1
            lastPinConversationId = conversationId
            lastPinMessageId = messageId
        }
        try pinResult.get()
    }

    nonisolated func unpin(conversationId: String, messageId: String) async throws {
        await MainActor.run {
            unpinCallCount += 1
            lastUnpinConversationId = conversationId
            lastUnpinMessageId = messageId
        }
        try unpinResult.get()
    }

    nonisolated func consumeViewOnce(conversationId: String, messageId: String) async throws -> ConsumeViewOnceResponse {
        await MainActor.run {
            consumeViewOnceCallCount += 1
            lastConsumeViewOnceConversationId = conversationId
            lastConsumeViewOnceMessageId = messageId
        }
        return try consumeViewOnceResult.get()
    }

    nonisolated func search(conversationId: String, query: String, limit: Int) async throws -> MessagesAPIResponse {
        await MainActor.run {
            searchCallCount += 1
            lastSearchConversationId = conversationId
            lastSearchQuery = query
            lastSearchLimit = limit
        }
        return try searchResult.get()
    }

    nonisolated func searchWithCursor(conversationId: String, query: String, cursor: String) async throws -> MessagesAPIResponse {
        await MainActor.run {
            searchWithCursorCallCount += 1
            lastSearchWithCursorConversationId = conversationId
            lastSearchWithCursorQuery = query
            lastSearchWithCursorCursor = cursor
        }
        return try searchWithCursorResult.get()
    }

    // MARK: - Reset

    func reset() {
        listCallCount = 0
        lastListConversationId = nil
        lastListOffset = nil
        lastListLimit = nil
        lastListIncludeReplies = nil
        lastListIncludeTranslations = nil
        lastListLanguages = nil
        listBeforeCallCount = 0
        lastListBeforeConversationId = nil
        lastListBeforeCursor = nil
        lastListBeforeLanguages = nil
        listAfterCallCount = 0
        lastListAfterConversationId = nil
        lastListAfterAfter = nil
        lastListAfterLimit = nil
        lastListAfterLanguages = nil
        listAfterResults = []
        listAroundCallCount = 0
        lastListAroundConversationId = nil
        lastListAroundMessageId = nil
        lastListAroundLanguages = nil
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
