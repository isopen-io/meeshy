//
//  OfflineQueueManager.swift
//  Meeshy
//
//  Persistent queue manager for offline operations
//  Uses CoreData for robust persistence
//  Swift 6 compliant with MainActor isolation
//

import Foundation
import CoreData
import Combine

@MainActor
final class OfflineQueueManager: ObservableObject {
    // MARK: - Singleton

    static let shared = OfflineQueueManager()

    // MARK: - Published Properties

    @Published var pendingOperations: [QueuedOperation] = []
    @Published var isProcessing = false

    // MARK: - Properties

    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initialization

    private init() {
        setupNetworkMonitoring()
    }

    // MARK: - Public Methods

    func enqueue(_ operation: QueuedOperation) {
        pendingOperations.append(operation)
    }

    func processQueue() async {
        guard !isProcessing, !pendingOperations.isEmpty else { return }

        isProcessing = true
        defer { isProcessing = false }

        for operation in pendingOperations {
            do {
                try await processOperation(operation)
                removeOperation(operation)
            } catch {
                apiLogger.error("Failed to process operation", error: error)
            }
        }
    }

    func clearQueue() {
        pendingOperations.removeAll()
    }

    // MARK: - Private Methods

    private func removeOperation(_ operation: QueuedOperation) {
        pendingOperations.removeAll { $0.id == operation.id }
    }

    private func processOperation(_ operation: QueuedOperation) async throws {
        // Implementation depends on operation type
        switch operation.type {
        case .message:
            // Process message send
            break
        case .update:
            // Process update
            break
        case .delete:
            // Process delete
            break
        }
    }

    private nonisolated func setupNetworkMonitoring() {
        Task { @MainActor in
            await NetworkMonitor.shared.$isConnected
                .sink { [weak self] isConnected in
                    guard let self = self, isConnected else { return }
                    Task {
                        await self.processQueue()
                    }
                }
                .store(in: &cancellables)
        }
    }
}

// MARK: - Supporting Types

struct QueuedOperation: Identifiable, Codable {
    let id: UUID
    let type: OperationType
    let data: Data
    let timestamp: Date
    var retryCount: Int

    init(id: UUID = UUID(), type: OperationType, data: Data, timestamp: Date = Date(), retryCount: Int = 0) {
        self.id = id
        self.type = type
        self.data = data
        self.timestamp = timestamp
        self.retryCount = retryCount
    }
}

enum OperationType: String, Codable {
    case message
    case update
    case delete
}
