import Foundation
import Combine
import MeeshySDK
import XCTest

final class MockConversationSyncEngine: ConversationSyncEngineProviding, @unchecked Sendable {

    // MARK: - Publishers

    private let _conversationsDidChange = PassthroughSubject<Void, Never>()
    private let _messagesDidChange = PassthroughSubject<String, Never>()

    var conversationsDidChange: AnyPublisher<Void, Never> { _conversationsDidChange.eraseToAnyPublisher() }
    var messagesDidChange: AnyPublisher<String, Never> { _messagesDidChange.eraseToAnyPublisher() }

    // MARK: - Stubbing

    var fullSyncResult: Bool = true
    var syncSinceLastCheckpointResult: Bool = true

    // MARK: - Call Tracking

    var fullSyncCallCount = 0
    var syncSinceLastCheckpointCallCount = 0
    var ensureMessagesCallCount = 0
    var fetchOlderMessagesCallCount = 0
    var cleanupRetentionCallCount = 0
    var startSocketRelayCallCount = 0
    var stopSocketRelayCallCount = 0
    var markConversationReadLocallyCallCount = 0
    var lastMarkReadConversationId: String?
    var updateConversationAfterSendCallCount = 0

    // MARK: - Protocol Conformance

    @discardableResult
    func fullSync() async -> Bool {
        fullSyncCallCount += 1
        return fullSyncResult
    }

    @discardableResult
    func syncSinceLastCheckpoint() async -> Bool {
        syncSinceLastCheckpointCallCount += 1
        return syncSinceLastCheckpointResult
    }

    func ensureMessages(for conversationId: String) async {
        ensureMessagesCallCount += 1
    }

    func fetchOlderMessages(for conversationId: String, before messageId: String) async {
        fetchOlderMessagesCallCount += 1
    }

    func cleanupRetentionIfNeeded() async {
        cleanupRetentionCallCount += 1
    }

    func startSocketRelay() async {
        startSocketRelayCallCount += 1
    }

    func stopSocketRelay() async {
        stopSocketRelayCallCount += 1
    }

    func markConversationReadLocally(_ conversationId: String) async {
        markConversationReadLocallyCallCount += 1
        lastMarkReadConversationId = conversationId
    }

    func updateConversationAfterSend(conversationId: String, messagePreview: String, messageAt: Date, senderName: String?) async {
        updateConversationAfterSendCallCount += 1
    }

    // MARK: - Simulation Helpers

    func simulateConversationsChanged() {
        _conversationsDidChange.send(())
    }

    func simulateMessagesChanged(conversationId: String) {
        _messagesDidChange.send(conversationId)
    }

    // MARK: - Reset

    func reset() {
        fullSyncResult = true
        syncSinceLastCheckpointResult = true
        fullSyncCallCount = 0
        syncSinceLastCheckpointCallCount = 0
        ensureMessagesCallCount = 0
        fetchOlderMessagesCallCount = 0
        cleanupRetentionCallCount = 0
        startSocketRelayCallCount = 0
        stopSocketRelayCallCount = 0
        markConversationReadLocallyCallCount = 0
        lastMarkReadConversationId = nil
        updateConversationAfterSendCallCount = 0
    }
}
