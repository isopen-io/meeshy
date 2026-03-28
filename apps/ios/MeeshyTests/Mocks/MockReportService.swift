import Foundation
import MeeshySDK
import XCTest

@MainActor
final class MockReportService: ReportServiceProviding {
    nonisolated init() {}

    // MARK: - Stubbing

    var reportMessageResult: Result<Void, Error> = .success(())
    var reportUserResult: Result<Void, Error> = .success(())
    var reportStoryResult: Result<Void, Error> = .success(())
    var reportConversationResult: Result<Void, Error> = .success(())

    // MARK: - Call Tracking

    var reportMessageCallCount = 0
    var lastReportMessageId: String?
    var lastReportMessageType: String?
    var lastReportMessageReason: String?

    var reportUserCallCount = 0
    var lastReportUserId: String?
    var lastReportUserType: String?
    var lastReportUserReason: String?

    var reportPostCallCount = 0

    var reportStoryCallCount = 0
    var lastReportStoryId: String?
    var lastReportStoryType: String?
    var lastReportStoryReason: String?

    var reportConversationCallCount = 0
    var lastReportConversationId: String?
    var lastReportConversationType: String?
    var lastReportConversationReason: String?

    // MARK: - Protocol Conformance

    nonisolated func reportMessage(messageId: String, reportType: String, reason: String?) async throws {
        await MainActor.run {
            reportMessageCallCount += 1
            lastReportMessageId = messageId
            lastReportMessageType = reportType
            lastReportMessageReason = reason
        }
        try await MainActor.run { try reportMessageResult.get() }
    }

    nonisolated func reportUser(userId: String, reportType: String, reason: String?) async throws {
        await MainActor.run {
            reportUserCallCount += 1
            lastReportUserId = userId
            lastReportUserType = reportType
            lastReportUserReason = reason
        }
        try await MainActor.run { try reportUserResult.get() }
    }

    nonisolated func reportPost(postId: String, reportType: String, reason: String?) async throws {
        await MainActor.run {
            reportPostCallCount += 1
        }
    }

    nonisolated func reportStory(storyId: String, reportType: String, reason: String?) async throws {
        await MainActor.run {
            reportStoryCallCount += 1
            lastReportStoryId = storyId
            lastReportStoryType = reportType
            lastReportStoryReason = reason
        }
        try await MainActor.run { try reportStoryResult.get() }
    }

    nonisolated func reportConversation(conversationId: String, reportType: String, reason: String?) async throws {
        await MainActor.run {
            reportConversationCallCount += 1
            lastReportConversationId = conversationId
            lastReportConversationType = reportType
            lastReportConversationReason = reason
        }
        try await MainActor.run { try reportConversationResult.get() }
    }

    // MARK: - Reset

    func reset() {
        reportMessageCallCount = 0
        lastReportMessageId = nil
        lastReportMessageType = nil
        lastReportMessageReason = nil
        reportUserCallCount = 0
        lastReportUserId = nil
        lastReportUserType = nil
        lastReportUserReason = nil
        reportPostCallCount = 0
        reportStoryCallCount = 0
        lastReportStoryId = nil
        lastReportStoryType = nil
        lastReportStoryReason = nil
        reportConversationCallCount = 0
        lastReportConversationId = nil
        lastReportConversationType = nil
        lastReportConversationReason = nil
    }
}
