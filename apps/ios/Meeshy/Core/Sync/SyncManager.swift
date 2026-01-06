//
//  SyncManager.swift
//  Meeshy
//
//  Bidirectional sync manager with conflict resolution
//  Handles incremental sync, full sync, and real-time updates
//  Swift 6 compliant with MainActor isolation
//

import Foundation
import CoreData
import Combine

@MainActor
final class SyncManager: ObservableObject {
    // MARK: - Singleton

    static let shared = SyncManager()

    // MARK: - Published Properties

    @Published var isSyncing: Bool = false
    @Published var lastSyncDate: Date?
    @Published var syncProgress: Double = 0.0
    @Published var syncError: Error?

    // MARK: - Properties

    private let coreDataManager: CoreDataManager
    private let networkMonitor: NetworkMonitor
    private let conflictResolver: ConflictResolver
    private let offlineQueue: OfflineQueueManager

    private let conversationRepository: ConversationRepository
    private let messageRepository: MessageRepository
    private let userRepository: UserRepository

    private var cancellables = Set<AnyCancellable>()
    private var syncTask: Task<Void, Never>?

    // Sync configuration
    private let syncInterval: TimeInterval = 300 // 5 minutes
    private let batchSize = 100

    // MARK: - Initialization

    init(
        coreDataManager: CoreDataManager = .shared,
        networkMonitor: NetworkMonitor = .shared,
        conflictResolver: ConflictResolver = .shared,
        offlineQueue: OfflineQueueManager = .shared
    ) {
        self.coreDataManager = coreDataManager
        self.networkMonitor = networkMonitor
        self.conflictResolver = conflictResolver
        self.offlineQueue = offlineQueue

        self.conversationRepository = ConversationRepository(coreDataManager: coreDataManager)
        self.messageRepository = MessageRepository(coreDataManager: coreDataManager)
        self.userRepository = UserRepository(coreDataManager: coreDataManager)

        Task { @MainActor in
            self.setupObservers()
            self.loadLastSyncDate()
        }
    }

    // MARK: - Sync Operations

    func startPeriodicSync() {
        syncTask?.cancel()

        syncTask = Task { @MainActor in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(syncInterval * 1_000_000_000))
                if !Task.isCancelled {
                    await self.syncIfNeeded()
                }
            }
        }

        syncLogger.info("Periodic sync started (interval: \(syncInterval)s)")
    }

    func stopPeriodicSync() {
        syncTask?.cancel()
        syncTask = nil
        syncLogger.info("Periodic sync stopped")
    }

    func syncIfNeeded() async {
        guard networkMonitor.isConnected else {
            syncLogger.warn("Sync skipped: No network connection")
            return
        }

        guard !isSyncing else {
            syncLogger.debug("Sync skipped: Already syncing")
            return
        }

        await performSync()
    }

    func forceSync() async {
        syncLogger.info("Force sync initiated")
        await performSync(force: true)
    }

    private func performSync(force: Bool = false) async {
        guard networkMonitor.isConnected || force else {
            syncLogger.warn("Sync aborted: No network")
            return
        }

        isSyncing = true
        syncProgress = 0.0
        syncError = nil

        syncLogger.info("Sync started")

        do {
            // Phase 1: Push local changes (20%)
            try await pushLocalChanges()
            updateProgress(0.2)

            // Phase 2: Pull remote changes (60%)
            try await pullRemoteChanges()
            updateProgress(0.8)

            // Phase 3: Process offline queue (20%)
            await offlineQueue.processQueue()
            updateProgress(1.0)

            // Update last sync date
            saveLastSyncDate()

            syncLogger.info("Sync completed successfully")

        } catch {
            syncLogger.error("Sync failed: \(error)")
            syncError = error
        }

        isSyncing = false
    }

    // MARK: - Push Local Changes

    private func pushLocalChanges() async throws {
        syncLogger.debug("Pushing local changes")

        // Push conversations
        let pendingConversations = try conversationRepository.fetchPendingSyncConversations()
        if !pendingConversations.isEmpty {
            try await pushConversations(pendingConversations)
        }

        // Push messages
        let pendingMessages = try messageRepository.fetchPendingSyncMessages()
        if !pendingMessages.isEmpty {
            try await pushMessages(pendingMessages)
        }

        // Push users (profile updates)
        let pendingUsers = try userRepository.fetchPendingSyncUsers()
        if !pendingUsers.isEmpty {
            try await pushUsers(pendingUsers)
        }

        syncLogger.info("Local changes pushed successfully")
    }

    private func pushConversations(_ conversations: [Conversation]) async throws {
        // In production, this would call your API
        syncLogger.debug("Pushing \(conversations.count) conversations")

        for conversation in conversations {
            // Simulate API call
            // let response = try await APIService.shared.updateConversation(conversation)

            // Mark as synced
            try conversationRepository.markAsSynced(id: conversation.id, serverVersion: 1)
        }
    }

    private func pushMessages(_ messages: [Message]) async throws {
        syncLogger.debug("Pushing \(messages.count) messages")

        for message in messages {
            // Simulate API call
            // let response = try await APIService.shared.updateMessage(message)

            // Mark as synced
            try messageRepository.markAsSynced(id: message.id, serverVersion: 1)
        }
    }

    private func pushUsers(_ users: [User]) async throws {
        syncLogger.debug("Pushing \(users.count) user updates")

        for user in users {
            // Simulate API call
            // let response = try await APIService.shared.updateUser(user)

            // Mark as synced
            try userRepository.markAsSynced(id: user.id, serverVersion: 1)
        }
    }

    // MARK: - Pull Remote Changes

    private func pullRemoteChanges() async throws {
        syncLogger.debug("Pulling remote changes")

        let lastSync = lastSyncDate ?? Date(timeIntervalSince1970: 0)

        // Pull conversations
        try await pullConversations(since: lastSync)
        updateProgress(0.4)

        // Pull messages
        try await pullMessages(since: lastSync)
        updateProgress(0.6)

        // Pull users
        try await pullUsers(since: lastSync)
        updateProgress(0.8)

        syncLogger.info("Remote changes pulled successfully")
    }

    private func pullConversations(since date: Date) async throws {
        // In production, this would call your API with pagination
        syncLogger.debug("Pulling conversations since \(date)")

        // Simulate API call
        // let remoteConversations = try await APIService.shared.getConversations(since: date, limit: batchSize)

        // For now, using empty array
        let remoteConversations: [Conversation] = []

        for remoteConv in remoteConversations {
            if let localConv = try? conversationRepository.fetch(id: remoteConv.id) {
                // Check for conflicts
                if conflictResolver.hasConflict(local: localConv, remote: remoteConv) {
                    let resolution = conflictResolver.resolve(local: localConv, remote: remoteConv)
                    conflictResolver.logConflict(local: localConv, remote: remoteConv, resolution: resolution)

                    if let resolved = resolution.resolved {
                        try conversationRepository.update(id: resolved.id, with: resolved)
                    }
                } else {
                    // No conflict, just update
                    try conversationRepository.update(id: remoteConv.id, with: remoteConv)
                }
            } else {
                // New conversation
                _ = try conversationRepository.create(remoteConv)
            }
        }
    }

    private func pullMessages(since date: Date) async throws {
        syncLogger.debug("Pulling messages since \(date)")

        // In production: try await APIService.shared.getMessages(since: date, limit: batchSize)
        let remoteMessages: [Message] = []

        for remoteMsg in remoteMessages {
            if let localMsg = try? messageRepository.fetch(id: remoteMsg.id) {
                // Check for conflicts
                if conflictResolver.hasConflict(local: localMsg, remote: remoteMsg) {
                    let resolution = conflictResolver.resolve(local: localMsg, remote: remoteMsg)
                    conflictResolver.logConflict(local: localMsg, remote: remoteMsg, resolution: resolution)

                    if let resolved = resolution.resolved {
                        try messageRepository.update(id: resolved.id, with: resolved)
                    }
                } else {
                    try messageRepository.update(id: remoteMsg.id, with: remoteMsg)
                }
            } else {
                _ = try messageRepository.create(remoteMsg)
            }
        }
    }

    private func pullUsers(since date: Date) async throws {
        syncLogger.debug("Pulling users since \(date)")

        // In production: try await APIService.shared.getUsers(since: date, limit: batchSize)
        let remoteUsers: [User] = []

        for remoteUser in remoteUsers {
            if let localUser = try? userRepository.fetch(id: remoteUser.id) {
                // Check for conflicts
                if conflictResolver.hasConflict(local: localUser, remote: remoteUser) {
                    let resolution = conflictResolver.resolve(local: localUser, remote: remoteUser)
                    conflictResolver.logConflict(local: localUser, remote: remoteUser, resolution: resolution)

                    if let resolved = resolution.resolved {
                        try userRepository.update(id: resolved.id, with: resolved)
                    }
                } else {
                    try userRepository.update(id: remoteUser.id, with: remoteUser)
                }
            } else {
                _ = try userRepository.create(remoteUser)
            }
        }
    }

    // MARK: - Real-time Sync

    func handleWebSocketUpdate(_ update: WebSocketUpdate) {
        syncLogger.debug("Handling WebSocket update: \(update.type)")

        Task {
            do {
                switch update.type {
                case .newMessage:
                    if let message = update.data as? Message {
                        try await handleNewMessage(message)
                    }

                case .messageUpdated:
                    if let message = update.data as? Message {
                        try await handleMessageUpdate(message)
                    }

                case .messageDeleted:
                    if let messageId = update.data as? String {
                        try messageRepository.delete(id: messageId)
                    }

                case .conversationUpdated:
                    if let conversation = update.data as? Conversation {
                        try await handleConversationUpdate(conversation)
                    }

                case .userStatusChanged:
                    if let userId = update.data as? String, let isOnline = update.metadata?["isOnline"] as? Bool {
                        try userRepository.updateOnlineStatus(id: userId, isOnline: isOnline)
                    }

                case .typingStarted, .typingStopped:
                    // Handle typing indicators in UI layer
                    NotificationCenter.default.post(name: .typingIndicatorChanged, object: update)

                default:
                    syncLogger.warn("Unhandled WebSocket update type: \(update.type)")
                }
            } catch {
                syncLogger.error("Failed to handle WebSocket update: \(error)")
            }
        }
    }

    private func handleNewMessage(_ message: Message) async throws {
        // Check if message already exists (deduplication)
        if let existing = try? messageRepository.fetch(id: message.id) {
            syncLogger.debug("Message already exists: \(message.id)")
            return
        }

        _ = try messageRepository.create(message)

        // Update conversation's last message
        try conversationRepository.updateLastMessage(conversationId: message.conversationId, message: message)

        syncLogger.debug("New message synced: \(message.id)")
    }

    private func handleMessageUpdate(_ message: Message) async throws {
        if let local = try? messageRepository.fetch(id: message.id) {
            let resolution = conflictResolver.resolve(local: local, remote: message)
            if let resolved = resolution.resolved {
                try messageRepository.update(id: resolved.id, with: resolved)
            }
        } else {
            _ = try messageRepository.create(message)
        }

        syncLogger.debug("Message update synced: \(message.id)")
    }

    private func handleConversationUpdate(_ conversation: Conversation) async throws {
        if let local = try? conversationRepository.fetch(id: conversation.id) {
            let resolution = conflictResolver.resolve(local: local, remote: conversation)
            if let resolved = resolution.resolved {
                try conversationRepository.update(id: resolved.id, with: resolved)
            }
        } else {
            _ = try conversationRepository.create(conversation)
        }

        syncLogger.debug("Conversation update synced: \(conversation.id)")
    }

    // MARK: - Helper Methods

    private func setupObservers() {
        // Monitor network status
        networkMonitor.$isConnected
            .sink { [weak self] isConnected in
                if isConnected {
                    syncLogger.info("Network connected, triggering sync")
                    Task { @MainActor [weak self] in
                        await self?.syncIfNeeded()
                    }
                }
            }
            .store(in: &cancellables)

        // Monitor CloudKit sync
        NotificationCenter.default.publisher(for: .cloudKitSyncCompleted)
            .sink { [weak self] _ in
                syncLogger.info("CloudKit sync completed")
                Task { @MainActor [weak self] in
                    self?.saveLastSyncDate()
                }
            }
            .store(in: &cancellables)
    }

    private func updateProgress(_ progress: Double) {
        syncProgress = progress
    }

    private func saveLastSyncDate() {
        let date = Date()
        UserDefaults.standard.set(date, forKey: "LastSyncDate")
        lastSyncDate = date
    }

    private func loadLastSyncDate() {
        if let date = UserDefaults.standard.object(forKey: "LastSyncDate") as? Date {
            lastSyncDate = date
        }
    }

    // MARK: - Cleanup

    func cleanup() {
        stopPeriodicSync()
        cancellables.removeAll()
    }
}

// MARK: - WebSocket Update Model

struct WebSocketUpdate: @unchecked Sendable {
    enum UpdateType: String, Sendable {
        case newMessage
        case messageUpdated
        case messageDeleted
        case conversationUpdated
        case conversationDeleted
        case userStatusChanged
        case typingStarted
        case typingStopped
        case callEnded
    }

    let type: UpdateType
    let data: Any
    let metadata: [String: Any]?
    let timestamp: Date
}

// MARK: - Notification Names

extension Notification.Name {
    // Sync notifications
    static let syncStarted = Notification.Name("syncStarted")
    static let syncCompleted = Notification.Name("syncCompleted")
    static let syncFailed = Notification.Name("syncFailed")
    static let typingIndicatorChanged = Notification.Name("typingIndicatorChanged")

    // Message cache notifications
    static let messagesDidUpdate = Notification.Name("messagesDidUpdate")
    static let messageDidUpdate = Notification.Name("messageDidUpdate")
}
