//
//  CoreDataManager.swift
//  Meeshy
//
//  Unified CoreData persistence layer for offline-first architecture
//  Single source of truth for all CoreData operations
//  iOS 16+
//
//  ARCHITECTURE:
//  - Async/await API for non-blocking operations
//  - Thread-safe with background contexts
//  - Observable loading state
//  - CloudKit support in Release builds only
//  - Proper merge policies for conflict resolution
//  - Automatic recovery from corrupted stores
//

import Foundation
@preconcurrency import CoreData

// MARK: - Core Data Loading State

enum CoreDataLoadingState: Sendable {
    case notLoaded
    case loading
    case loaded
    case failed(Error)

    var isReady: Bool {
        if case .loaded = self { return true }
        return false
    }
}

// MARK: - Core Data Manager

final class CoreDataManager: ObservableObject, @unchecked Sendable {

    // MARK: - Singleton

    nonisolated(unsafe) static let shared = CoreDataManager()

    // MARK: - Published Properties

    @Published private(set) var loadingState: CoreDataLoadingState = .notLoaded

    // MARK: - Properties

    private var persistentContainer: NSPersistentContainer?
    private var _backgroundContext: NSManagedObjectContext?

    /// Continuation for waiting on store load
    private var loadContinuation: CheckedContinuation<Bool, Never>?

    /// Flag indicating if CoreData is available
    private(set) var isAvailable: Bool = false

    /// Main context for UI operations (main thread)
    var viewContext: NSManagedObjectContext? {
        persistentContainer?.viewContext
    }

    /// Background context for write operations (lazy initialized after store loads)
    private var backgroundContext: NSManagedObjectContext? {
        guard let container = persistentContainer else { return nil }
        if let context = _backgroundContext {
            return context
        }
        let context = container.newBackgroundContext()
        context.mergePolicy = NSMergeByPropertyObjectTrumpMergePolicy
        context.automaticallyMergesChangesFromParent = true
        context.undoManager = nil
        _backgroundContext = context
        return context
    }

    // MARK: - Initialization

    private init() {
        // Try to load the CoreData model
        guard let modelURL = Bundle.main.url(forResource: "Meeshy", withExtension: "momd"),
              let model = NSManagedObjectModel(contentsOf: modelURL) else {
            cacheLogger.warn("CoreData: Model not found - CoreData disabled (using fast cache instead)")
            loadingState = .failed(NSError(domain: "CoreDataManager", code: 1, userInfo: [NSLocalizedDescriptionKey: "Model not found"]))
            isAvailable = false
            return
        }

        // Use standard container for now (CloudKit requires proper entitlements)
        // TODO: Enable CloudKit when iCloud entitlements are properly configured
        persistentContainer = NSPersistentContainer(name: "Meeshy", managedObjectModel: model)

        isAvailable = true

        // Configure store description before loading
        configureStoreDescription()

        // Start loading stores asynchronously
        loadingState = .loading
        loadStoresAsync()
    }

    // MARK: - Configuration

    private func configureStoreDescription() {
        guard let container = persistentContainer,
              let description = container.persistentStoreDescriptions.first else {
            cacheLogger.debug("CoreData: No store description to configure")
            return
        }

        // Enable automatic migration
        description.shouldMigrateStoreAutomatically = true
        description.shouldInferMappingModelAutomatically = true

        // Enable persistent history tracking for sync
        description.setOption(true as NSNumber, forKey: NSPersistentHistoryTrackingKey)
        description.setOption(true as NSNumber, forKey: NSPersistentStoreRemoteChangeNotificationPostOptionKey)

        // CloudKit configuration disabled until iCloud entitlements are properly configured
        // TODO: Re-enable when CloudKit is ready
        // if let cloudKitContainer = container as? NSPersistentCloudKitContainer {
        //     let cloudKitOptions = NSPersistentCloudKitContainerOptions(containerIdentifier: "iCloud.me.meeshy.app")
        //     description.cloudKitContainerOptions = cloudKitOptions
        // }
    }

    // MARK: - Store Loading

    private func loadStoresAsync() {
        guard let container = persistentContainer else {
            cacheLogger.debug("CoreData: No container to load stores")
            return
        }

        container.loadPersistentStores { [weak self] description, error in
            Task { @MainActor [weak self] in
                guard let self = self else { return }

                if let error = error {
                    cacheLogger.error("CoreData failed to load: \(error.localizedDescription)")

                    // Attempt recovery
                    if let storeURL = description.url {
                        await self.attemptRecoveryAsync(storeURL: storeURL)
                    } else {
                        self.loadingState = .failed(error)
                        self.loadContinuation?.resume(returning: false)
                        self.loadContinuation = nil
                    }
                } else {
                    cacheLogger.info("CoreData loaded successfully: \(description.url?.lastPathComponent ?? "unknown")")
                    self.configureContexts()
                    self.setupNotificationObservers()
                    self.loadingState = .loaded
                    self.loadContinuation?.resume(returning: true)
                    self.loadContinuation = nil
                }
            }
        }
    }

    private func configureContexts() {
        // Configure view context
        guard let context = viewContext else { return }
        context.automaticallyMergesChangesFromParent = true
        context.mergePolicy = NSMergeByPropertyObjectTrumpMergePolicy
        context.undoManager = nil
        context.shouldDeleteInaccessibleFaults = true
    }

    // MARK: - Wait for Ready

    /// Wait for CoreData to be ready (stores loaded)
    /// Returns true if loaded successfully, false if failed
    func waitUntilReady() async -> Bool {
        if loadingState.isReady {
            return true
        }

        if case .failed = loadingState {
            return false
        }

        return await withCheckedContinuation { continuation in
            self.loadContinuation = continuation
        }
    }

    // MARK: - Recovery

    private func attemptRecoveryAsync(storeURL: URL) async {
        guard let container = persistentContainer else {
            loadingState = .failed(NSError(domain: "CoreDataManager", code: 2, userInfo: [NSLocalizedDescriptionKey: "No container for recovery"]))
            return
        }

        cacheLogger.warn("Attempting CoreData recovery by removing corrupted store")

        do {
            try FileManager.default.removeItem(at: storeURL)

            // Reload stores after removing corrupted one
            await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                container.loadPersistentStores { [weak self] description, error in
                    Task { @MainActor [weak self] in
                        guard let self = self else {
                            continuation.resume()
                            return
                        }

                        if let error = error {
                            cacheLogger.error("CoreData recovery failed: \(error.localizedDescription)")
                            self.loadingState = .failed(error)
                        } else {
                            cacheLogger.info("CoreData recovered successfully")
                            self.configureContexts()
                            self.setupNotificationObservers()
                            self.loadingState = .loaded
                        }
                        continuation.resume()
                    }
                }
            }
        } catch {
            cacheLogger.error("Failed to remove corrupted store: \(error.localizedDescription)")
            loadingState = .failed(error)
        }
    }

    // MARK: - Notification Observers

    private func setupNotificationObservers() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(contextDidSave(_:)),
            name: .NSManagedObjectContextDidSave,
            object: nil
        )

        #if !DEBUG
        // CloudKit remote change notification
        if let coordinator = persistentContainer?.persistentStoreCoordinator {
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(storeRemoteChange(_:)),
                name: .NSPersistentStoreRemoteChange,
                object: coordinator
            )
        }
        #endif
    }

    @objc private func contextDidSave(_ notification: Notification) {
        guard let context = notification.object as? NSManagedObjectContext,
              let mainContext = viewContext,
              context !== mainContext else { return }

        mainContext.perform {
            mainContext.mergeChanges(fromContextDidSave: notification)
        }
    }

    @objc private func storeRemoteChange(_ notification: Notification) {
        cacheLogger.info("Remote store change detected")
        viewContext?.perform { [weak self] in
            self?.viewContext?.refreshAllObjects()
        }
        NotificationCenter.default.post(name: .cloudKitSyncCompleted, object: nil)
    }

    // MARK: - Context Management

    /// Create a new background context for isolated operations
    func newBackgroundContext() -> NSManagedObjectContext? {
        guard let container = persistentContainer else { return nil }
        let context = container.newBackgroundContext()
        context.mergePolicy = NSMergeByPropertyObjectTrumpMergePolicy
        context.automaticallyMergesChangesFromParent = true
        context.undoManager = nil
        return context
    }

    /// Perform work on background context
    func performBackgroundTask(_ block: @escaping (NSManagedObjectContext) -> Void) {
        guard loadingState.isReady, let bgContext = backgroundContext else {
            cacheLogger.debug("CoreData not ready or unavailable, skipping background task")
            return
        }
        bgContext.perform {
            block(bgContext)
        }
    }

    /// Perform work and wait
    func performBackgroundTaskAndWait(_ block: @escaping (NSManagedObjectContext) -> Void) {
        guard loadingState.isReady, let bgContext = backgroundContext else {
            cacheLogger.debug("CoreData not ready or unavailable, skipping background task")
            return
        }
        bgContext.performAndWait {
            block(bgContext)
        }
    }

    /// Perform async background task with result
    func performBackgroundTask<T: Sendable>(_ block: @escaping @Sendable (NSManagedObjectContext) throws -> T) async throws -> T {
        guard loadingState.isReady, let context = newBackgroundContext() else {
            throw NSError(domain: "CoreDataManager", code: 1, userInfo: [NSLocalizedDescriptionKey: "CoreData not ready or unavailable"])
        }

        return try await context.perform {
            try block(context)
        }
    }

    // MARK: - Save

    func save(context: NSManagedObjectContext? = nil) {
        guard let contextToSave = context ?? viewContext else { return }

        guard contextToSave.hasChanges else { return }

        contextToSave.perform {
            do {
                try contextToSave.save()
                cacheLogger.trace("CoreData context saved successfully")
            } catch {
                cacheLogger.error("CoreData save failed: \(error.localizedDescription)")
            }
        }
    }

    func saveAndWait(context: NSManagedObjectContext? = nil) {
        guard let contextToSave = context ?? viewContext else { return }

        guard contextToSave.hasChanges else { return }

        contextToSave.performAndWait {
            do {
                try contextToSave.save()
            } catch {
                cacheLogger.error("CoreData save failed: \(error.localizedDescription)")
            }
        }
    }

    /// Save context asynchronously with async/await
    func saveAsync(context: NSManagedObjectContext? = nil) async throws {
        guard let contextToSave = context ?? viewContext else { return }

        guard contextToSave.hasChanges else { return }

        try await contextToSave.perform {
            try contextToSave.save()
        }
    }

    // MARK: - Clear All Data

    func clearAllData() {
        guard loadingState.isReady, let container = persistentContainer, let mainContext = viewContext else { return }

        let entities = container.managedObjectModel.entities

        performBackgroundTaskAndWait { context in
            for entity in entities {
                guard let name = entity.name else { continue }

                let fetchRequest = NSFetchRequest<NSFetchRequestResult>(entityName: name)
                let deleteRequest = NSBatchDeleteRequest(fetchRequest: fetchRequest)
                deleteRequest.resultType = .resultTypeObjectIDs

                do {
                    let result = try context.execute(deleteRequest) as? NSBatchDeleteResult
                    let objectIDs = result?.result as? [NSManagedObjectID] ?? []

                    // Merge changes to view context
                    let changes = [NSDeletedObjectsKey: objectIDs]
                    NSManagedObjectContext.mergeChanges(fromRemoteContextSave: changes, into: [mainContext])

                    cacheLogger.debug("Deleted all \(name) entities")
                } catch {
                    cacheLogger.error("Failed to delete \(name): \(error.localizedDescription)")
                }
            }
        }

        cacheLogger.info("CoreData cleared all data")
    }

    // MARK: - Batch Operations

    func batchDelete<T: NSManagedObject>(
        _ fetchRequest: NSFetchRequest<T>,
        in context: NSManagedObjectContext? = nil
    ) throws {
        guard let ctx = context ?? viewContext else {
            cacheLogger.debug("CoreData: No context available for batch delete")
            return
        }
        guard let typedFetchRequest = fetchRequest as? NSFetchRequest<NSFetchRequestResult> else {
            cacheLogger.error("Failed to cast fetch request for batch delete")
            return
        }
        let deleteRequest = NSBatchDeleteRequest(fetchRequest: typedFetchRequest)
        deleteRequest.resultType = .resultTypeObjectIDs

        let result = try ctx.execute(deleteRequest) as? NSBatchDeleteResult
        guard let objectIDs = result?.result as? [NSManagedObjectID] else { return }

        let changes = [NSDeletedObjectsKey: objectIDs]
        NSManagedObjectContext.mergeChanges(fromRemoteContextSave: changes, into: [ctx])
    }
}

// MARK: - Conversation Persistence

extension CoreDataManager {

    /// Save conversations to CoreData (batch upsert)
    func saveConversations(_ conversations: [Conversation]) {
        guard loadingState.isReady else { return }

        performBackgroundTask { context in
            for conversation in conversations {
                self.upsertConversation(conversation, in: context)
            }

            self.saveAndWait(context: context)
            cacheLogger.info("Saved \(conversations.count) conversations to CoreData")
        }
    }

    /// Upsert a single conversation
    private func upsertConversation(_ conversation: Conversation, in context: NSManagedObjectContext) {
        let request: NSFetchRequest<CachedConversation> = CachedConversation.fetchRequest()
        request.predicate = NSPredicate(format: "id == %@", conversation.id)
        request.fetchLimit = 1

        let cachedConversation: CachedConversation

        if let existing = try? context.fetch(request).first {
            cachedConversation = existing
        } else {
            cachedConversation = CachedConversation(context: context)
        }

        // Update attributes only
        cachedConversation.id = conversation.id
        cachedConversation.type = conversation.type.rawValue
        cachedConversation.name = conversation.title
        cachedConversation.avatarURL = conversation.avatar
        cachedConversation.unreadCount = Int32(conversation.unreadCount)
        cachedConversation.isArchived = conversation.isArchived
        cachedConversation.isMuted = conversation.isMuted
        cachedConversation.createdAt = conversation.createdAt
        cachedConversation.updatedAt = conversation.updatedAt
        cachedConversation.isSoftDeleted = false
        cachedConversation.syncedAt = Date()
        cachedConversation.needsSync = false

        // Save lastMessage if available
        if let lastMessage = conversation.lastMessage {
            let cachedMessage = upsertMessageForConversation(lastMessage, conversationId: conversation.id, in: context)
            cachedConversation.lastMessage = cachedMessage

            // Save sender info if available
            if let sender = lastMessage.sender {
                upsertSenderForMessage(sender, in: context)
            }
        }
    }

    /// Upsert a message and return the cached entity (for lastMessage relationship)
    private func upsertMessageForConversation(_ message: Message, conversationId: String, in context: NSManagedObjectContext) -> CachedMessage {
        let request: NSFetchRequest<CachedMessage> = CachedMessage.fetchRequest()
        request.predicate = NSPredicate(format: "id == %@", message.id)
        request.fetchLimit = 1

        let cachedMessage: CachedMessage

        if let existing = try? context.fetch(request).first {
            cachedMessage = existing
        } else {
            cachedMessage = CachedMessage(context: context)
        }

        cachedMessage.id = message.id
        cachedMessage.conversationId = conversationId
        cachedMessage.senderId = message.senderId
        cachedMessage.content = message.content
        cachedMessage.type = message.messageType.rawValue
        cachedMessage.status = message.deliveryStatus.rawValue
        cachedMessage.isEdited = message.isEdited
        cachedMessage.editedAt = message.editedAt
        cachedMessage.replyToId = message.replyToId
        cachedMessage.createdAt = message.createdAt
        cachedMessage.updatedAt = message.updatedAt
        cachedMessage.isSoftDeleted = message.isDeleted
        cachedMessage.syncedAt = Date()

        // Link sender if available
        if let sender = message.sender {
            let senderRequest: NSFetchRequest<CachedUser> = CachedUser.fetchRequest()
            senderRequest.predicate = NSPredicate(format: "id == %@", sender.id)
            senderRequest.fetchLimit = 1

            if let cachedSender = try? context.fetch(senderRequest).first {
                cachedMessage.sender = cachedSender
            }
        }

        return cachedMessage
    }

    /// Upsert sender info for a message
    private func upsertSenderForMessage(_ sender: MessageSender, in context: NSManagedObjectContext) {
        let request: NSFetchRequest<CachedUser> = CachedUser.fetchRequest()
        request.predicate = NSPredicate(format: "id == %@", sender.id)
        request.fetchLimit = 1

        let cachedUser: CachedUser

        if let existing = try? context.fetch(request).first {
            cachedUser = existing
        } else {
            cachedUser = CachedUser(context: context)
        }

        cachedUser.id = sender.id
        cachedUser.username = sender.username
        cachedUser.displayName = sender.displayName
        cachedUser.avatarURL = sender.avatar
        cachedUser.syncedAt = Date()
    }

    /// Load all conversations from CoreData (synchronous - for compatibility)
    func loadConversations() -> [Conversation] {
        guard loadingState.isReady, let context = viewContext else { return [] }

        let request: NSFetchRequest<CachedConversation> = CachedConversation.fetchRequest()
        request.predicate = NSPredicate(format: "isSoftDeleted == NO")
        request.sortDescriptors = [NSSortDescriptor(key: "updatedAt", ascending: false)]
        request.relationshipKeyPathsForPrefetching = ["lastMessage", "lastMessage.sender"]

        do {
            let cached = try context.fetch(request)
            return cached.compactMap { mapToConversation($0) }
        } catch {
            cacheLogger.error("Failed to load conversations: \(error.localizedDescription)")
            return []
        }
    }

    /// Load all conversations from CoreData asynchronously (non-blocking)
    func loadConversationsAsync() async -> [Conversation] {
        // Wait for CoreData to be ready
        guard await waitUntilReady(), let container = persistentContainer else {
            cacheLogger.debug("CoreData not ready or unavailable for async load")
            return []
        }

        return await withCheckedContinuation { continuation in
            let context = container.newBackgroundContext()
            context.perform {
                let request: NSFetchRequest<CachedConversation> = CachedConversation.fetchRequest()
                request.predicate = NSPredicate(format: "isSoftDeleted == NO")
                request.sortDescriptors = [NSSortDescriptor(key: "updatedAt", ascending: false)]
                request.relationshipKeyPathsForPrefetching = ["lastMessage", "lastMessage.sender"]

                do {
                    let cached = try context.fetch(request)
                    let conversations = cached.compactMap { self.mapToConversationFromBackground($0) }
                    cacheLogger.debug("Async loaded \(conversations.count) conversations from CoreData")
                    continuation.resume(returning: conversations)
                } catch {
                    cacheLogger.error("Failed to load conversations async: \(error.localizedDescription)")
                    continuation.resume(returning: [])
                }
            }
        }
    }

    /// Map CachedConversation to Conversation model (thread-safe for background context)
    private func mapToConversationFromBackground(_ cached: CachedConversation) -> Conversation? {
        guard let id = cached.id,
              let typeString = cached.type,
              let type = ConversationType(rawValue: typeString),
              let createdAt = cached.createdAt else {
            return nil
        }

        let lastMessage: Message? = {
            guard let cachedMsg = cached.lastMessage,
                  let msgId = cachedMsg.id,
                  let senderId = cachedMsg.senderId,
                  let content = cachedMsg.content,
                  let msgCreatedAt = cachedMsg.createdAt else {
                return nil
            }

            let sender: MessageSender? = {
                guard let cachedSender = cachedMsg.sender,
                      let senderId = cachedSender.id,
                      let username = cachedSender.username else {
                    return nil
                }
                return MessageSender(
                    id: senderId,
                    username: username,
                    displayName: cachedSender.displayName,
                    avatar: cachedSender.avatarURL
                )
            }()

            return Message(
                id: msgId,
                conversationId: id,
                senderId: senderId,
                anonymousSenderId: nil,
                content: content,
                originalLanguage: "fr",
                messageType: MessageContentType(rawValue: cachedMsg.type ?? "text") ?? .text,
                isEdited: cachedMsg.isEdited,
                editedAt: cachedMsg.editedAt,
                isDeleted: cachedMsg.isSoftDeleted,
                deletedAt: nil,
                replyToId: cachedMsg.replyToId,
                validatedMentions: [],
                createdAt: msgCreatedAt,
                updatedAt: cachedMsg.updatedAt ?? msgCreatedAt,
                sender: sender,
                attachments: nil,
                reactions: nil,
                mentions: nil,
                status: nil,
                localId: nil,
                isSending: false,
                sendError: nil
            )
        }()

        return Conversation(
            id: id,
            identifier: id,
            type: type,
            title: cached.name,
            description: nil,
            image: nil,
            avatar: cached.avatarURL,
            communityId: nil,
            isActive: true,
            isArchived: cached.isArchived,
            lastMessageAt: cached.updatedAt ?? createdAt,
            createdAt: createdAt,
            updatedAt: cached.updatedAt ?? createdAt,
            members: nil,
            lastMessage: lastMessage,
            shareLinks: nil,
            anonymousParticipants: nil,
            userPreferences: nil,
            unreadCount: Int(cached.unreadCount),
            isMuted: cached.isMuted,
            isPinned: false
        )
    }

    /// Map CachedConversation to Conversation model
    private func mapToConversation(_ cached: CachedConversation) -> Conversation? {
        mapToConversationFromBackground(cached)
    }

    /// Delete a conversation
    func deleteConversation(id: String) {
        guard loadingState.isReady else { return }

        performBackgroundTask { context in
            let request: NSFetchRequest<CachedConversation> = CachedConversation.fetchRequest()
            request.predicate = NSPredicate(format: "id == %@", id)

            if let conversation = try? context.fetch(request).first {
                context.delete(conversation)
                self.saveAndWait(context: context)
            }
        }
    }
}

// MARK: - Message Persistence

extension CoreDataManager {

    /// Save messages to CoreData for a conversation
    func saveMessages(_ messages: [Message], conversationId: String) {
        guard loadingState.isReady else { return }

        performBackgroundTask { context in
            for message in messages {
                self.upsertMessage(message, conversationId: conversationId, in: context)
            }

            self.saveAndWait(context: context)
            cacheLogger.debug("Saved \(messages.count) messages for conversation \(conversationId)")
        }
    }

    /// Upsert a single message
    private func upsertMessage(_ message: Message, conversationId: String, in context: NSManagedObjectContext) {
        let request: NSFetchRequest<CachedMessage> = CachedMessage.fetchRequest()
        request.predicate = NSPredicate(format: "id == %@", message.id)
        request.fetchLimit = 1

        let cachedMessage: CachedMessage

        if let existing = try? context.fetch(request).first {
            cachedMessage = existing
        } else {
            cachedMessage = CachedMessage(context: context)
        }

        cachedMessage.id = message.id
        cachedMessage.conversationId = conversationId
        cachedMessage.senderId = message.senderId
        cachedMessage.content = message.content
        cachedMessage.type = message.messageType.rawValue
        cachedMessage.status = message.deliveryStatus.rawValue
        cachedMessage.isEdited = message.isEdited
        cachedMessage.editedAt = message.editedAt
        cachedMessage.replyToId = message.replyToId
        cachedMessage.createdAt = message.createdAt
        cachedMessage.updatedAt = message.updatedAt
        cachedMessage.isSoftDeleted = message.isDeleted
        cachedMessage.isSending = message.isSending
        cachedMessage.sendError = message.sendError
        cachedMessage.localId = message.localId?.uuidString
        cachedMessage.syncedAt = Date()
        cachedMessage.needsSync = false

        // Link to conversation if possible
        if cachedMessage.conversation == nil {
            let convRequest: NSFetchRequest<CachedConversation> = CachedConversation.fetchRequest()
            convRequest.predicate = NSPredicate(format: "id == %@", conversationId)
            convRequest.fetchLimit = 1

            if let conversation = try? context.fetch(convRequest).first {
                cachedMessage.conversation = conversation
            }
        }

        // Link or create sender if available
        if let sender = message.sender {
            let userRequest: NSFetchRequest<CachedUser> = CachedUser.fetchRequest()
            userRequest.predicate = NSPredicate(format: "id == %@", sender.id)
            userRequest.fetchLimit = 1

            let cachedUser: CachedUser
            if let existingUser = try? context.fetch(userRequest).first {
                cachedUser = existingUser
            } else {
                cachedUser = CachedUser(context: context)
                cachedUser.id = sender.id
            }
            cachedUser.username = sender.username
            cachedUser.displayName = sender.displayName
            cachedUser.avatarURL = sender.avatar
            cachedMessage.sender = cachedUser
        }

        // Upsert translations
        if let translations = message.translations, !translations.isEmpty {
            for translation in translations {
                let transRequest = NSFetchRequest<CachedTranslation>(entityName: "CachedTranslation")
                transRequest.predicate = NSPredicate(format: "id == %@", translation.id)
                transRequest.fetchLimit = 1

                let cachedTranslation: CachedTranslation
                if let existingTrans = try? context.fetch(transRequest).first {
                    cachedTranslation = existingTrans
                } else {
                    cachedTranslation = CachedTranslation(context: context)
                    cachedTranslation.id = translation.id
                }
                cachedTranslation.messageId = message.id
                cachedTranslation.sourceLanguage = translation.sourceLanguage
                cachedTranslation.targetLanguage = translation.targetLanguage
                cachedTranslation.translatedContent = translation.translatedContent
                cachedTranslation.detectedLanguage = translation.detectedLanguage
                cachedTranslation.createdAt = translation.createdAt
                cachedTranslation.syncedAt = Date()
                cachedTranslation.message = cachedMessage
            }
        }

        // Upsert attachments
        if let attachments = message.attachments, !attachments.isEmpty {
            for attachment in attachments {
                let attachRequest = NSFetchRequest<CachedAttachment>(entityName: "CachedAttachment")
                attachRequest.predicate = NSPredicate(format: "id == %@", attachment.id)
                attachRequest.fetchLimit = 1

                let cachedAttachment: CachedAttachment
                if let existingAttach = try? context.fetch(attachRequest).first {
                    cachedAttachment = existingAttach
                } else {
                    cachedAttachment = CachedAttachment(context: context)
                    cachedAttachment.id = attachment.id
                }
                cachedAttachment.messageId = message.id
                cachedAttachment.filename = attachment.originalName
                cachedAttachment.mimeType = attachment.mimeType
                cachedAttachment.size = Int64(attachment.fileSize)
                cachedAttachment.url = attachment.fileUrl
                cachedAttachment.thumbnailURL = attachment.thumbnailUrl
                cachedAttachment.width = Int32(attachment.width ?? 0)
                cachedAttachment.height = Int32(attachment.height ?? 0)
                cachedAttachment.duration = Double(attachment.duration ?? 0) / 1000.0
                cachedAttachment.createdAt = attachment.createdAt
                cachedAttachment.syncedAt = Date()
                cachedAttachment.message = cachedMessage
            }
        }
    }

    /// Load messages for a conversation
    func loadMessages(conversationId: String, limit: Int = 50) -> [Message] {
        guard loadingState.isReady, let context = viewContext else { return [] }

        let request: NSFetchRequest<CachedMessage> = CachedMessage.fetchRequest()
        request.predicate = NSPredicate(format: "conversationId == %@ AND isSoftDeleted == NO", conversationId)
        request.sortDescriptors = [NSSortDescriptor(key: "createdAt", ascending: false)]
        request.fetchLimit = limit

        do {
            let cached = try context.fetch(request)
            return cached.compactMap { mapToMessage($0, conversationId: conversationId) }
        } catch {
            cacheLogger.error("Failed to load messages: \(error.localizedDescription)")
            return []
        }
    }

    /// Load all messages grouped by conversation
    func loadAllMessages(limit: Int = 50) -> [String: [Message]] {
        guard loadingState.isReady, let context = viewContext else { return [:] }

        let request: NSFetchRequest<CachedMessage> = CachedMessage.fetchRequest()
        request.predicate = NSPredicate(format: "isSoftDeleted == NO")
        request.sortDescriptors = [
            NSSortDescriptor(key: "conversationId", ascending: true),
            NSSortDescriptor(key: "createdAt", ascending: false)
        ]

        do {
            let cached = try context.fetch(request)

            var grouped: [String: [Message]] = [:]
            var counts: [String: Int] = [:]

            for cachedMessage in cached {
                guard let conversationId = cachedMessage.conversationId,
                      let message = mapToMessage(cachedMessage, conversationId: conversationId) else {
                    continue
                }

                let count = counts[conversationId] ?? 0
                if count < limit {
                    if grouped[conversationId] == nil {
                        grouped[conversationId] = []
                    }
                    grouped[conversationId]?.append(message)
                    counts[conversationId] = count + 1
                }
            }

            return grouped
        } catch {
            cacheLogger.error("Failed to load all messages: \(error.localizedDescription)")
            return [:]
        }
    }

    /// Map CachedMessage to Message model
    private func mapToMessage(_ cached: CachedMessage, conversationId: String) -> Message? {
        guard let id = cached.id,
              let content = cached.content,
              let typeString = cached.type,
              let type = MessageContentType(rawValue: typeString),
              let createdAt = cached.createdAt else {
            return nil
        }

        var sender: MessageSender? = nil
        if let cachedSender = cached.sender,
           let senderId = cachedSender.id {
            sender = MessageSender(
                id: senderId,
                username: cachedSender.username,
                displayName: cachedSender.displayName,
                avatar: cachedSender.avatarURL
            )
        }

        var translations: [MessageTranslation]? = nil
        if let cachedTranslations = cached.translations as? Set<CachedTranslation>, !cachedTranslations.isEmpty {
            translations = cachedTranslations.compactMap { cachedTranslation -> MessageTranslation? in
                guard let translationId = cachedTranslation.id,
                      let targetLanguage = cachedTranslation.targetLanguage,
                      let translatedContent = cachedTranslation.translatedContent else {
                    return nil
                }
                return MessageTranslation(
                    id: translationId,
                    messageId: cachedTranslation.messageId,
                    sourceLanguage: cachedTranslation.sourceLanguage,
                    targetLanguage: targetLanguage,
                    translatedContent: translatedContent,
                    detectedLanguage: cachedTranslation.detectedLanguage,
                    translationModel: nil,
                    provider: nil,
                    cacheKey: nil,
                    confidenceScore: nil,
                    processingTimeMs: nil,
                    cached: true,
                    createdAt: cachedTranslation.createdAt,
                    updatedAt: nil
                )
            }
        }

        var attachments: [MessageAttachment]? = nil
        if let cachedAttachments = cached.attachments as? Set<CachedAttachment>, !cachedAttachments.isEmpty {
            attachments = cachedAttachments.compactMap { cachedAttachment -> MessageAttachment? in
                guard let attachmentId = cachedAttachment.id,
                      let fileUrl = cachedAttachment.url else {
                    return nil
                }
                return MessageAttachment(
                    id: attachmentId,
                    messageId: cachedAttachment.messageId,
                    originalName: cachedAttachment.filename ?? "file",
                    mimeType: cachedAttachment.mimeType ?? "application/octet-stream",
                    fileSize: Int(cachedAttachment.size),
                    fileUrl: fileUrl,
                    width: cachedAttachment.width > 0 ? Int(cachedAttachment.width) : nil,
                    height: cachedAttachment.height > 0 ? Int(cachedAttachment.height) : nil,
                    thumbnailUrl: cachedAttachment.thumbnailURL,
                    duration: cachedAttachment.duration > 0 ? Int(cachedAttachment.duration * 1000) : nil,
                    createdAt: cachedAttachment.createdAt ?? Date()
                )
            }
        }

        return Message(
            id: id,
            conversationId: conversationId,
            senderId: cached.senderId,
            anonymousSenderId: nil,
            content: content,
            originalLanguage: "fr",
            messageType: type,
            isEdited: cached.isEdited,
            editedAt: cached.editedAt,
            isDeleted: cached.isSoftDeleted,
            deletedAt: nil,
            replyToId: cached.replyToId,
            validatedMentions: [],
            createdAt: createdAt,
            updatedAt: cached.updatedAt ?? createdAt,
            sender: sender,
            attachments: attachments,
            translations: translations,
            reactions: nil,
            mentions: nil,
            status: nil,
            localId: cached.localId.flatMap { UUID(uuidString: $0) },
            isSending: cached.isSending,
            sendError: cached.sendError
        )
    }

    /// Delete messages for a conversation
    func deleteMessages(conversationId: String) {
        guard loadingState.isReady else { return }

        performBackgroundTask { context in
            let request: NSFetchRequest<NSFetchRequestResult> = CachedMessage.fetchRequest()
            request.predicate = NSPredicate(format: "conversationId == %@", conversationId)

            let deleteRequest = NSBatchDeleteRequest(fetchRequest: request)

            do {
                try context.execute(deleteRequest)
                self.saveAndWait(context: context)
            } catch {
                cacheLogger.error("Failed to delete messages: \(error.localizedDescription)")
            }
        }
    }
}

// MARK: - User Persistence

extension CoreDataManager {

    /// Save a user to CoreData
    func saveUser(_ user: User) {
        guard loadingState.isReady else { return }

        performBackgroundTask { context in
            self.upsertUser(user, in: context)
            self.saveAndWait(context: context)
        }
    }

    /// Upsert a single user
    private func upsertUser(_ user: User, in context: NSManagedObjectContext) {
        let request: NSFetchRequest<CachedUser> = CachedUser.fetchRequest()
        request.predicate = NSPredicate(format: "id == %@", user.id)
        request.fetchLimit = 1

        let cachedUser: CachedUser

        if let existing = try? context.fetch(request).first {
            cachedUser = existing
        } else {
            cachedUser = CachedUser(context: context)
        }

        cachedUser.id = user.id
        cachedUser.username = user.username
        cachedUser.email = user.email
        cachedUser.displayName = user.displayName
        cachedUser.avatarURL = user.avatar
        cachedUser.bio = user.bio
        cachedUser.phoneNumber = user.phoneNumber
        cachedUser.preferredLanguage = user.systemLanguage
        cachedUser.isOnline = user.isOnline
        cachedUser.lastActiveAt = user.lastActiveAt
        cachedUser.createdAt = user.createdAt
        cachedUser.updatedAt = Date()
        cachedUser.syncedAt = Date()
    }

    /// Load a user from CoreData
    func loadUser(id: String) -> User? {
        guard loadingState.isReady, let context = viewContext else { return nil }

        let request: NSFetchRequest<CachedUser> = CachedUser.fetchRequest()
        request.predicate = NSPredicate(format: "id == %@", id)
        request.fetchLimit = 1

        guard let cached = try? context.fetch(request).first else {
            return nil
        }

        return mapToUser(cached)
    }

    /// Map CachedUser to User model
    private func mapToUser(_ cached: CachedUser) -> User? {
        guard let id = cached.id,
              let username = cached.username else {
            return nil
        }

        return User(
            id: id,
            username: username,
            firstName: cached.firstName ?? "",
            lastName: cached.lastName ?? "",
            bio: cached.bio ?? "",
            email: cached.email ?? "",
            phoneNumber: cached.phoneNumber,
            displayName: cached.displayName,
            avatar: cached.avatarURL,
            isOnline: cached.isOnline,
            lastActiveAt: cached.lastActiveAt,
            systemLanguage: cached.preferredLanguage ?? "en",
            autoTranslateEnabled: cached.autoTranslateEnabled,
            twoFactorEnabledAt: cached.twoFactorEnabled ? Date() : nil,
            createdAt: cached.createdAt ?? Date(),
            updatedAt: cached.updatedAt ?? Date()
        )
    }
}

// MARK: - Notification Names

extension Notification.Name {
    static let cloudKitSyncCompleted = Notification.Name("cloudKitSyncCompleted")
    static let persistentStoreLoadFailed = Notification.Name("persistentStoreLoadFailed")
}
