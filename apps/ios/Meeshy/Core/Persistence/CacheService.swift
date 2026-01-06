//
//  CacheService.swift
//  Meeshy
//
//  Core Data persistence layer for offline-first architecture
//  Supports iOS 16+ with SwiftData fallback for iOS 17+
//

import Foundation
@preconcurrency import CoreData

final class CacheService: @unchecked Sendable {
    // MARK: - Singleton

    static let shared = CacheService()

    // MARK: - Core Data Stack

    private lazy var persistentContainer: NSPersistentContainer = {
        let container = NSPersistentContainer(name: "Meeshy")

        container.loadPersistentStores { description, error in
            if let error = error {
                syncLogger.error("Core Data failed to load: \(error)")

                // Attempt to recover by deleting the corrupted store
                if let storeURL = description.url {
                    do {
                        try FileManager.default.removeItem(at: storeURL)
                        syncLogger.warn("Corrupted store removed, attempting to reload")

                        // Try loading again after removing corrupted store
                        container.loadPersistentStores { newDescription, newError in
                            if let newError = newError {
                                syncLogger.error("Core Data reload failed after recovery attempt: \(newError)")
                                // At this point, we've tried recovery. Log error but don't crash.
                                // The app can still function with network-only mode
                            } else {
                                syncLogger.info("Core Data successfully recovered")
                            }
                        }
                    } catch {
                        syncLogger.error("Failed to remove corrupted store: \(error)")
                        // App can still function without cache
                    }
                }
            }
        }

        container.viewContext.automaticallyMergesChangesFromParent = true
        container.viewContext.mergePolicy = NSMergeByPropertyObjectTrumpMergePolicy

        return container
    }()

    private var context: NSManagedObjectContext {
        persistentContainer.viewContext
    }

    // MARK: - Initialization

    private init() {}

    // MARK: - Save Context

    func saveContext() {
        guard context.hasChanges else { return }

        do {
            try context.save()
        } catch {
            syncLogger.error("Failed to save context: \(error)")
        }
    }

    // MARK: - User Caching

    func cacheUser(_ user: User) {
        let request: NSFetchRequest<CachedUser> = CachedUser.fetchRequest()
        request.predicate = NSPredicate(format: "id == %@", user.id)

        let isNew: Bool
        let cachedUser: CachedUser

        if let existing = try? context.fetch(request).first {
            cachedUser = existing
            isNew = false
        } else {
            cachedUser = CachedUser(context: context)
            isNew = true
        }

        cachedUser.id = user.id
        cachedUser.username = user.username
        cachedUser.email = user.email
        cachedUser.displayName = user.displayName
        cachedUser.avatarURL = user.avatar
        cachedUser.bio = user.bio
        cachedUser.preferredLanguage = user.systemLanguage
        cachedUser.isOnline = user.isOnline
        cachedUser.lastSeen = user.lastSeen
        cachedUser.createdAt = user.createdAt
        cachedUser.updatedAt = Date()

        // Initialize relationships for new entities to avoid nil insertion errors
        if isNew {
            cachedUser.sentMessages = NSSet()
            cachedUser.participations = NSSet()
            cachedUser.readReceipts = NSSet()
            cachedUser.callerOfCalls = NSSet()
            cachedUser.participatedCalls = NSSet()
        }

        saveContext()
    }

    func getUser(id: String) -> User? {
        let request: NSFetchRequest<CachedUser> = CachedUser.fetchRequest()
        request.predicate = NSPredicate(format: "id == %@", id)
        request.fetchLimit = 1

        guard let cachedUser = try? context.fetch(request).first else {
            return nil
        }

        // Note: CacheService stores minimal user data for offline caching
        // Full user model requires backend sync for complete field population
        return User(
            id: cachedUser.id ?? "",
            username: cachedUser.username ?? "",
            firstName: "",  // Not cached, requires sync
            lastName: "",   // Not cached, requires sync
            bio: cachedUser.bio ?? "",
            email: cachedUser.email ?? "",
            phoneNumber: cachedUser.phoneNumber,
            displayName: cachedUser.displayName,
            avatar: cachedUser.avatarURL,
            isOnline: cachedUser.isOnline,
            lastSeen: cachedUser.lastSeen,
            lastActiveAt: cachedUser.lastSeen,
            systemLanguage: cachedUser.preferredLanguage ?? "en",
            autoTranslateEnabled: cachedUser.autoTranslateEnabled,
            twoFactorEnabledAt: cachedUser.twoFactorEnabled ? Date() : nil,
            createdAt: cachedUser.createdAt ?? Date(),
            updatedAt: cachedUser.updatedAt ?? Date()
            // All other fields use default values from initializer
        )
    }

    // MARK: - Conversation Caching

    func cacheConversations(_ conversations: [Conversation]) {
        // Clear existing
        let deleteRequest = NSBatchDeleteRequest(fetchRequest: CachedConversation.fetchRequest())
        try? context.execute(deleteRequest)

        // Cache new conversations
        for conversation in conversations {
            cacheConversation(conversation)
        }

        saveContext()
    }

    func cacheConversation(_ conversation: Conversation) {
        let request: NSFetchRequest<CachedConversation> = CachedConversation.fetchRequest()
        request.predicate = NSPredicate(format: "id == %@", conversation.id)

        let isNew: Bool
        let cachedConversation: CachedConversation

        if let existing = try? context.fetch(request).first {
            cachedConversation = existing
            isNew = false
        } else {
            cachedConversation = CachedConversation(context: context)
            isNew = true
        }

        cachedConversation.id = conversation.id
        cachedConversation.type = conversation.type.rawValue
        cachedConversation.name = conversation.title
        cachedConversation.unreadCount = Int32(conversation.unreadCount)
        cachedConversation.isArchived = conversation.isArchived
        cachedConversation.isMuted = conversation.isMuted
        cachedConversation.updatedAt = conversation.updatedAt
        cachedConversation.createdAt = conversation.createdAt
        cachedConversation.avatarURL = conversation.avatar
        cachedConversation.isSoftDeleted = false

        // Only set relationships to empty sets for new entities to avoid nil insertion errors
        if isNew {
            cachedConversation.messages = NSSet()
            cachedConversation.participants = NSSet()
            cachedConversation.calls = NSSet()
        }

        saveContext()
    }

    func getCachedConversations() -> [Conversation] {
        let request: NSFetchRequest<CachedConversation> = CachedConversation.fetchRequest()
        request.sortDescriptors = [NSSortDescriptor(key: "updatedAt", ascending: false)]

        guard let cachedConversations = try? context.fetch(request) else {
            return []
        }

        return cachedConversations.compactMap { cached -> Conversation? in
            guard let id = cached.id,
                  let typeString = cached.type,
                  let type = ConversationType(rawValue: typeString),
                  let createdAt = cached.createdAt else {
                return nil
            }

            return Conversation(
                id: id,
                identifier: id,
                type: type,
                title: cached.name,
                description: nil as String?,
                image: nil as String?,
                avatar: cached.avatarURL,
                communityId: nil as String?,
                isActive: true,
                isArchived: cached.isArchived,
                lastMessageAt: cached.updatedAt ?? createdAt,
                createdAt: createdAt,
                updatedAt: cached.updatedAt ?? createdAt,
                members: nil as [ConversationMember]?,
                lastMessage: nil as Message?,
                shareLinks: nil as [ConversationShareLink]?,
                anonymousParticipants: nil as [AnonymousParticipant]?,
                userPreferences: nil as UserConversationPreferences?,
                unreadCount: Int(cached.unreadCount),
                isMuted: cached.isMuted,
                isPinned: false
            )
        }
    }

    // MARK: - Message Caching

    func cacheMessages(_ messages: [Message], conversationId: String) {
        for message in messages {
            cacheMessage(message, conversationId: conversationId)
        }
        saveContext()
    }

    func cacheMessage(_ message: Message, conversationId: String) {
        let request: NSFetchRequest<CachedMessage> = CachedMessage.fetchRequest()
        request.predicate = NSPredicate(format: "id == %@", message.id)

        let isNew: Bool
        let cachedMessage: CachedMessage

        if let existing = try? context.fetch(request).first {
            cachedMessage = existing
            isNew = false
        } else {
            cachedMessage = CachedMessage(context: context)
            isNew = true
        }

        cachedMessage.id = message.id
        cachedMessage.conversationId = conversationId
        cachedMessage.senderId = message.senderId
        cachedMessage.content = message.content
        cachedMessage.type = message.messageType.rawValue
        cachedMessage.status = message.deliveryStatus.rawValue
        cachedMessage.isEdited = message.isEdited
        cachedMessage.createdAt = message.createdAt
        cachedMessage.updatedAt = message.updatedAt
        cachedMessage.isSoftDeleted = message.isDeleted

        // Initialize relationships for new entities to avoid nil insertion errors
        if isNew {
            cachedMessage.attachments = NSSet()
            cachedMessage.translations = NSSet()
            cachedMessage.readReceipts = NSSet()
        }

        saveContext()
    }

    func getCachedMessages(conversationId: String, limit: Int = 50, offset: Int = 0) -> [Message] {
        let request: NSFetchRequest<CachedMessage> = CachedMessage.fetchRequest()
        request.predicate = NSPredicate(format: "conversationId == %@", conversationId)
        request.sortDescriptors = [NSSortDescriptor(key: "createdAt", ascending: false)]
        request.fetchLimit = limit
        request.fetchOffset = offset

        guard let cachedMessages = try? context.fetch(request) else {
            return []
        }

        return cachedMessages.compactMap { cached -> Message? in
            guard let id = cached.id,
                  let content = cached.content,
                  let typeString = cached.type,
                  let type = MessageContentType(rawValue: typeString),
                  let createdAt = cached.createdAt else {
                return nil
            }

            // Convert cached status string to MessageDeliveryStatus array if available
            var deliveryStatusArray: [MessageDeliveryStatus]?
            if let statusString = cached.status,
               let statusEnum = MessageDeliveryStatus.Status(rawValue: statusString) {
                // Create a minimal MessageDeliveryStatus with the status
                let deliveryStatus = MessageDeliveryStatus(
                    id: "",
                    conversationId: conversationId,
                    messageId: id,
                    userId: "",
                    receivedAt: statusEnum == .delivered || statusEnum == .read ? createdAt : nil,
                    readAt: statusEnum == .read ? createdAt : nil,
                    updatedAt: createdAt
                )
                deliveryStatusArray = [deliveryStatus]
            }

            // Map sender from cached user if available
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

            // Map translations from cached translations
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

            // Map attachments from cached attachments
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
                anonymousSenderId: nil as String?,
                content: content,
                originalLanguage: "fr",
                messageType: type,
                isEdited: cached.isEdited,
                editedAt: cached.editedAt,
                isDeleted: false,
                deletedAt: nil as Date?,
                replyToId: cached.replyToId,
                validatedMentions: [],
                createdAt: createdAt,
                updatedAt: cached.updatedAt ?? createdAt,
                sender: sender,
                attachments: attachments,
                translations: translations,
                reactions: nil as [Reaction]?,
                mentions: nil as [Mention]?,
                status: deliveryStatusArray,
                localId: nil as UUID?,
                isSending: false,
                sendError: cached.sendError
            )
        }
    }

    // MARK: - Clear Cache

    func clearAll() {
        let entities = persistentContainer.managedObjectModel.entities
        for entity in entities {
            if let name = entity.name {
                let fetchRequest = NSFetchRequest<NSFetchRequestResult>(entityName: name)
                let deleteRequest = NSBatchDeleteRequest(fetchRequest: fetchRequest)
                try? context.execute(deleteRequest)
            }
        }
        saveContext()
    }

    func clearConversation(id: String) {
        // Delete messages
        let messageRequest: NSFetchRequest<NSFetchRequestResult> = CachedMessage.fetchRequest()
        messageRequest.predicate = NSPredicate(format: "conversationId == %@", id)
        let deleteMessages = NSBatchDeleteRequest(fetchRequest: messageRequest)
        try? context.execute(deleteMessages)

        // Delete conversation
        let convRequest: NSFetchRequest<NSFetchRequestResult> = CachedConversation.fetchRequest()
        convRequest.predicate = NSPredicate(format: "id == %@", id)
        let deleteConv = NSBatchDeleteRequest(fetchRequest: convRequest)
        try? context.execute(deleteConv)

        saveContext()
    }
}

// MARK: - Core Data Entity Extensions

extension CachedUser {
    @nonobjc public class func fetchRequest() -> NSFetchRequest<CachedUser> {
        return NSFetchRequest<CachedUser>(entityName: "CachedUser")
    }
}

extension CachedConversation {
    @nonobjc public class func fetchRequest() -> NSFetchRequest<CachedConversation> {
        return NSFetchRequest<CachedConversation>(entityName: "CachedConversation")
    }
}

extension CachedMessage {
    @nonobjc public class func fetchRequest() -> NSFetchRequest<CachedMessage> {
        return NSFetchRequest<CachedMessage>(entityName: "CachedMessage")
    }
}
