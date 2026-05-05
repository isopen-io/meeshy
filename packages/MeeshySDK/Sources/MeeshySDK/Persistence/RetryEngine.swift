import Foundation
import GRDB

public protocol MessageSending: Sendable {
    func send(conversationId: String, content: String?, contentType: String,
              encryptedPayload: Data?, attachments: Data?) async throws -> SendMessageResponse
}

public struct SendMessageResponse: Sendable {
    public let id: String
    public let createdAt: Date
    public init(id: String, createdAt: Date) {
        self.id = id
        self.createdAt = createdAt
    }
}

public actor RetryEngine {
    private let persistence: MessagePersistenceActor
    private let sender: MessageSending
    private let dbWriter: any DatabaseWriter
    private var observationCancellable: AnyDatabaseCancellable?
    private var isProcessing = false

    private static let backoffBase: TimeInterval = 1
    private static let backoffMultiplier: Double = 3

    public init(persistence: MessagePersistenceActor, dbWriter: any DatabaseWriter, sender: MessageSending) {
        self.persistence = persistence
        self.sender = sender
        self.dbWriter = dbWriter
    }

    public func start() {
        let observation = ValueObservation.tracking { db in
            try MessageRecord
                .filter(Column("state") == MessageState.queued.rawValue)
                .order(Column("createdAt").asc)
                .fetchAll(db)
        }

        observationCancellable = observation.start(in: dbWriter, onError: { _ in }, onChange: { @Sendable [weak self] queuedMessages in
            Task { await self?.processQueue(queuedMessages) }
        })
    }

    public func stop() {
        observationCancellable = nil
    }

    private func processQueue(_ messages: [MessageRecord]) async {
        guard !isProcessing, !messages.isEmpty else { return }
        isProcessing = true
        defer { isProcessing = false }

        for message in messages {
            let delay = Self.backoffBase * pow(Self.backoffMultiplier, Double(message.retryCount))
            try? await Task.sleep(for: .seconds(delay))

            _ = try? await persistence.applyEvent(localId: message.localId, event: .startSending)

            do {
                let response = try await sender.send(
                    conversationId: message.conversationId,
                    content: message.content,
                    contentType: message.contentType,
                    encryptedPayload: message.encryptedPayload,
                    attachments: message.attachmentsJson
                )
                _ = try? await persistence.applyEvent(
                    localId: message.localId,
                    event: .serverAck(serverId: response.id, at: response.createdAt)
                )
            } catch {
                _ = try? await persistence.applyEvent(
                    localId: message.localId, event: .sendFailed(error))
            }
        }
    }

    public func manualRetry(localId: String) async {
        _ = try? await persistence.applyEvent(localId: localId, event: .retry)
    }
}
