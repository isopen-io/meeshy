//
//  MessageRepository.swift
//  Meeshy
//
//  Offline-first repository for message data access
//  Handles local persistence, sync, and conflict resolution
//

import Foundation
import CoreData
import Combine

final class MessageRepository: BaseRepository {
    typealias Entity = CachedMessage
    typealias Model = Message

    // MARK: - Properties

    let coreDataManager: CoreDataManager

    // MARK: - Initialization

    init(coreDataManager: CoreDataManager = .shared) {
        self.coreDataManager = coreDataManager
    }

    // MARK: - CRUD Operations

    func create(_ model: Message) throws -> CachedMessage {
        let context = try getContext()
        let entity = CachedMessage(context: context)

        _ = toEntity(model, entity: entity)

        try save(context: context)
        return entity
    }

    func fetch(id: String) throws -> Message? {
        let context = try getContext()
        let request: NSFetchRequest<CachedMessage> = CachedMessage.fetchRequest()
        request.predicate = NSPredicate(format: "id == %@", id)
        request.fetchLimit = 1

        do {
            let results = try context.fetch(request)
            return results.first.flatMap { toModel($0) }
        } catch {
            throw RepositoryError.fetchFailed(error)
        }
    }

    func fetchAll() throws -> [Message] {
        let context = try getContext()
        let request: NSFetchRequest<CachedMessage> = CachedMessage.fetchRequest()
        request.sortDescriptors = [NSSortDescriptor(key: "createdAt", ascending: false)]

        do {
            let results = try context.fetch(request)
            return results.compactMap { toModel($0) }
        } catch {
            throw RepositoryError.fetchFailed(error)
        }
    }

    func update(id: String, with model: Message) throws {
        guard let entity = try fetchEntity(id: id) else {
            throw RepositoryError.notFound
        }

        _ = toEntity(model, entity: entity)
        entity.needsSync = true

        try save()
    }

    func delete(id: String) throws {
        guard let entity = try fetchEntity(id: id) else {
            throw RepositoryError.notFound
        }

        entity.isSoftDeleted = true
        entity.needsSync = true

        try save()
    }

    func deleteAll() throws {
        let context = try getContext()
        let request: NSFetchRequest<NSFetchRequestResult> = CachedMessage.fetchRequest()
        let deleteRequest = NSBatchDeleteRequest(fetchRequest: request)

        do {
            try context.execute(deleteRequest)
            try save()
        } catch {
            throw RepositoryError.deleteFailed(error)
        }
    }

    // MARK: - Conversation-Specific Methods

    func fetchMessages(
        for conversationId: String,
        limit: Int = 50,
        offset: Int = 0
    ) throws -> [Message] {
        let context = try getContext()
        let request: NSFetchRequest<CachedMessage> = CachedMessage.fetchRequest()
        request.predicate = NSPredicate(format: "conversationId == %@ AND isSoftDeleted == NO", conversationId)
        request.sortDescriptors = [NSSortDescriptor(key: "createdAt", ascending: false)]
        request.fetchLimit = limit
        request.fetchOffset = offset

        do {
            let results = try context.fetch(request)
            return results.compactMap { toModel($0) }
        } catch {
            throw RepositoryError.fetchFailed(error)
        }
    }

    func fetchUnsentMessages() throws -> [Message] {
        let context = try getContext()
        let request: NSFetchRequest<CachedMessage> = CachedMessage.fetchRequest()
        request.predicate = NSPredicate(format: "isSending == YES OR needsSync == YES")
        request.sortDescriptors = [NSSortDescriptor(key: "createdAt", ascending: true)]

        do {
            let results = try context.fetch(request)
            return results.compactMap { toModel($0) }
        } catch {
            throw RepositoryError.fetchFailed(error)
        }
    }

    func createOptimistic(_ model: Message) throws -> Message {
        var optimisticMessage = model
        optimisticMessage.localId = UUID()
        optimisticMessage.isSending = true

        let entity = try create(optimisticMessage)
        entity.needsSync = true

        return toModel(entity) ?? optimisticMessage
    }

    func updateMessageStatus(id: String, status: MessageDeliveryStatus.Status) throws {
        guard let entity = try fetchEntity(id: id) else {
            throw RepositoryError.notFound
        }

        entity.status = status.rawValue
        entity.updatedAt = Date()

        try save()
    }

    func markMessageAsSent(localId: UUID, serverId: String) throws {
        let context = try getContext()
        let request: NSFetchRequest<CachedMessage> = CachedMessage.fetchRequest()
        request.predicate = NSPredicate(format: "localId == %@", localId.uuidString)
        request.fetchLimit = 1

        guard let entity = try? context.fetch(request).first else {
            throw RepositoryError.notFound
        }

        entity.id = serverId
        entity.isSending = false
        entity.status = MessageDeliveryStatus.Status.sent.rawValue
        entity.needsSync = false
        entity.syncedAt = Date()

        try save()
    }

    func markMessageAsFailed(localId: UUID, error: String) throws {
        let context = try getContext()
        let request: NSFetchRequest<CachedMessage> = CachedMessage.fetchRequest()
        request.predicate = NSPredicate(format: "localId == %@", localId.uuidString)
        request.fetchLimit = 1

        guard let entity = try? context.fetch(request).first else {
            throw RepositoryError.notFound
        }

        entity.isSending = false
        entity.sendError = error
        entity.status = MessageDeliveryStatus.Status.failed.rawValue

        try save()
    }

    func searchMessages(query: String, in conversationId: String? = nil) throws -> [Message] {
        let context = try getContext()
        let request: NSFetchRequest<CachedMessage> = CachedMessage.fetchRequest()

        var predicates: [NSPredicate] = [
            NSPredicate(format: "content CONTAINS[cd] %@", query),
            NSPredicate(format: "isSoftDeleted == NO")
        ]

        if let conversationId = conversationId {
            predicates.append(NSPredicate(format: "conversationId == %@", conversationId))
        }

        request.predicate = NSCompoundPredicate(andPredicateWithSubpredicates: predicates)
        request.sortDescriptors = [NSSortDescriptor(key: "createdAt", ascending: false)]

        do {
            let results = try context.fetch(request)
            return results.compactMap { toModel($0) }
        } catch {
            throw RepositoryError.fetchFailed(error)
        }
    }

    // MARK: - Sync Operations

    func fetchPendingSyncMessages() throws -> [Message] {
        let context = try getContext()
        let request: NSFetchRequest<CachedMessage> = CachedMessage.fetchRequest()
        request.predicate = NSPredicate(format: "needsSync == YES")
        request.sortDescriptors = [NSSortDescriptor(key: "updatedAt", ascending: true)]

        do {
            let results = try context.fetch(request)
            return results.compactMap { toModel($0) }
        } catch {
            throw RepositoryError.fetchFailed(error)
        }
    }

    func markAsSynced(id: String, serverVersion: Int64) throws {
        guard let entity = try fetchEntity(id: id) else {
            throw RepositoryError.notFound
        }

        entity.needsSync = false
        entity.syncedAt = Date()
        entity.serverVersion = serverVersion

        try save()
    }

    func markAsNeedsSync(id: String) throws {
        guard let entity = try fetchEntity(id: id) else {
            throw RepositoryError.notFound
        }

        entity.needsSync = true
        try save()
    }

    // MARK: - Helper Methods

    private func fetchEntity(id: String) throws -> CachedMessage? {
        let context = try getContext()
        let request: NSFetchRequest<CachedMessage> = CachedMessage.fetchRequest()
        request.predicate = NSPredicate(format: "id == %@", id)
        request.fetchLimit = 1

        return try? context.fetch(request).first
    }

    // MARK: - Model <-> Entity Mapping

    func toModel(_ entity: CachedMessage) -> Message? {
        guard let id = entity.id,
              let conversationId = entity.conversationId,
              let content = entity.content,
              let typeString = entity.type,
              let type = MessageContentType(rawValue: typeString),
              let createdAt = entity.createdAt else {
            return nil
        }

        // Create MessageDeliveryStatus array if status exists
        var deliveryStatusArray: [MessageDeliveryStatus]?
        if let statusString = entity.status,
           let statusEnum = MessageDeliveryStatus.Status(rawValue: statusString) {
            // Create a delivery status object with computed status
            // Note: We're creating a minimal MessageDeliveryStatus since we don't have all fields in cache
            let deliveryStatus = MessageDeliveryStatus(
                id: "\(id)_status",
                conversationId: conversationId,
                messageId: id,
                userId: entity.senderId ?? "",
                receivedAt: statusEnum == .delivered || statusEnum == .read ? Date() : nil,
                readAt: statusEnum == .read ? Date() : nil,
                updatedAt: entity.updatedAt ?? createdAt
            )
            deliveryStatusArray = [deliveryStatus]
        }

        var message = Message(
            id: id,
            conversationId: conversationId,
            senderId: entity.senderId,  // Now optional - can be nil for anonymous
            anonymousSenderId: nil,  // Not stored in cache
            content: content,
            originalLanguage: "fr",  // Default - originalLanguage not stored in CachedMessage entity
            messageType: type,
            isEdited: entity.isEdited,
            editedAt: entity.editedAt,
            isDeleted: entity.isSoftDeleted,
            deletedAt: nil,  // deletedAt not stored in CachedMessage entity
            replyToId: entity.replyToId,
            validatedMentions: [],  // Not stored in cache entity
            createdAt: createdAt,
            updatedAt: entity.updatedAt ?? createdAt,
            attachments: nil,
            reactions: nil,
            mentions: nil,
            status: deliveryStatusArray
        )

        // Add local properties
        if let localIdString = entity.localId, let localId = UUID(uuidString: localIdString) {
            message.localId = localId
        }
        message.isSending = entity.isSending
        message.sendError = entity.sendError

        return message
    }

    func toEntity(_ model: Message, entity: CachedMessage?) -> CachedMessage {
        let isNew = entity == nil
        guard let ctx = viewContext ?? coreDataManager.newBackgroundContext() else {
            fatalError("MessageRepository: Failed to get Core Data context - this should never happen")
        }
        let entity = entity ?? CachedMessage(context: ctx)

        entity.id = model.id
        entity.conversationId = model.conversationId
        entity.senderId = model.senderId  // Optional - can be nil for anonymous
        entity.content = model.content
        // Note: originalLanguage not stored in CachedMessage entity
        entity.type = model.messageType.rawValue
        entity.status = model.deliveryStatus.rawValue  // Use computed deliveryStatus property
        entity.isEdited = model.isEdited
        entity.editedAt = model.editedAt
        entity.isSoftDeleted = model.isDeleted
        // Note: deletedAt not stored in CachedMessage entity
        entity.replyToId = model.replyToId
        entity.createdAt = model.createdAt
        entity.updatedAt = model.updatedAt

        // Local properties
        entity.localId = model.localId?.uuidString
        entity.isSending = model.isSending
        entity.sendError = model.sendError

        // Initialize NSSet relationships for new entities to avoid nil insertion errors
        if isNew {
            entity.attachments = NSSet()
            entity.translations = NSSet()
            entity.readReceipts = NSSet()
        }

        return entity
    }
}

// MARK: - Publisher Extensions

extension MessageRepository {
    func messagesPublisher(for conversationId: String) -> AnyPublisher<[Message], Error> {
        let request: NSFetchRequest<CachedMessage> = CachedMessage.fetchRequest()
        request.predicate = NSPredicate(format: "conversationId == %@ AND isSoftDeleted == NO", conversationId)
        request.sortDescriptors = [NSSortDescriptor(key: "createdAt", ascending: false)]

        return NotificationCenter.default
            .publisher(for: .NSManagedObjectContextObjectsDidChange, object: viewContext)
            .compactMap { [weak self] _ in
                try? self?.fetchMessages(for: conversationId)
            }
            .setFailureType(to: Error.self)
            .eraseToAnyPublisher()
    }
}
