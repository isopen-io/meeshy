//
//  ConversationRepository.swift
//  Meeshy
//
//  Offline-first repository for conversation data access
//

import Foundation
import CoreData
import Combine

final class ConversationRepository: BaseRepository {
    typealias Entity = CachedConversation
    typealias Model = Conversation

    // MARK: - Properties

    let coreDataManager: CoreDataManager
    private let messageRepository: MessageRepository

    // MARK: - Initialization

    init(
        coreDataManager: CoreDataManager = .shared,
        messageRepository: MessageRepository = MessageRepository()
    ) {
        self.coreDataManager = coreDataManager
        self.messageRepository = messageRepository
    }

    // MARK: - CRUD Operations

    func create(_ model: Conversation) throws -> CachedConversation {
        let context = try getContext()
        let entity = CachedConversation(context: context)

        _ = toEntity(model, entity: entity)

        try save(context: context)
        return entity
    }

    func fetch(id: String) throws -> Conversation? {
        let context = try getContext()
        let request: NSFetchRequest<CachedConversation> = CachedConversation.fetchRequest()
        request.predicate = NSPredicate(format: "id == %@ AND isSoftDeleted == NO", id)
        request.fetchLimit = 1

        do {
            let results = try context.fetch(request)
            return results.first.flatMap { toModel($0) }
        } catch {
            throw RepositoryError.fetchFailed(error)
        }
    }

    func fetchAll() throws -> [Conversation] {
        let context = try getContext()
        let request: NSFetchRequest<CachedConversation> = CachedConversation.fetchRequest()
        request.predicate = NSPredicate(format: "isSoftDeleted == NO")
        request.sortDescriptors = [NSSortDescriptor(key: "updatedAt", ascending: false)]

        do {
            let results = try context.fetch(request)
            return results.compactMap { toModel($0) }
        } catch {
            throw RepositoryError.fetchFailed(error)
        }
    }

    func update(id: String, with model: Conversation) throws {
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
        let request: NSFetchRequest<NSFetchRequestResult> = CachedConversation.fetchRequest()
        let deleteRequest = NSBatchDeleteRequest(fetchRequest: request)

        do {
            try context.execute(deleteRequest)
            try save()
        } catch {
            throw RepositoryError.deleteFailed(error)
        }
    }

    // MARK: - Conversation-Specific Methods

    func fetchUnread() throws -> [Conversation] {
        let context = try getContext()
        let request: NSFetchRequest<CachedConversation> = CachedConversation.fetchRequest()
        request.predicate = NSPredicate(format: "unreadCount > 0 AND isSoftDeleted == NO")
        request.sortDescriptors = [NSSortDescriptor(key: "updatedAt", ascending: false)]

        do {
            let results = try context.fetch(request)
            return results.compactMap { toModel($0) }
        } catch {
            throw RepositoryError.fetchFailed(error)
        }
    }

    func fetchArchived() throws -> [Conversation] {
        let context = try getContext()
        let request: NSFetchRequest<CachedConversation> = CachedConversation.fetchRequest()
        request.predicate = NSPredicate(format: "isArchived == YES AND isSoftDeleted == NO")
        request.sortDescriptors = [NSSortDescriptor(key: "updatedAt", ascending: false)]

        do {
            let results = try context.fetch(request)
            return results.compactMap { toModel($0) }
        } catch {
            throw RepositoryError.fetchFailed(error)
        }
    }

    func markAsRead(id: String) throws {
        guard let entity = try fetchEntity(id: id) else {
            throw RepositoryError.notFound
        }

        entity.unreadCount = 0
        entity.needsSync = true

        try save()
    }

    func incrementUnreadCount(id: String) throws {
        guard let entity = try fetchEntity(id: id) else {
            throw RepositoryError.notFound
        }

        entity.unreadCount += 1
        try save()
    }

    func updateArchiveStatus(id: String, isArchived: Bool) throws {
        guard let entity = try fetchEntity(id: id) else {
            throw RepositoryError.notFound
        }

        entity.isArchived = isArchived
        entity.needsSync = true

        try save()
    }

    func updateMuteStatus(id: String, isMuted: Bool) throws {
        guard let entity = try fetchEntity(id: id) else {
            throw RepositoryError.notFound
        }

        entity.isMuted = isMuted
        entity.needsSync = true

        try save()
    }

    func updateLastMessage(conversationId: String, message: Message) throws {
        guard let entity = try fetchEntity(id: conversationId) else {
            throw RepositoryError.notFound
        }

        // Create or fetch message entity
        let messageEntity = try? messageRepository.create(message)
        entity.lastMessage = messageEntity
        entity.updatedAt = message.createdAt

        try save()
    }

    func searchConversations(query: String) throws -> [Conversation] {
        let context = try getContext()
        let request: NSFetchRequest<CachedConversation> = CachedConversation.fetchRequest()
        request.predicate = NSPredicate(
            format: "name CONTAINS[cd] %@ AND isSoftDeleted == NO",
            query
        )
        request.sortDescriptors = [NSSortDescriptor(key: "updatedAt", ascending: false)]

        do {
            let results = try context.fetch(request)
            return results.compactMap { toModel($0) }
        } catch {
            throw RepositoryError.fetchFailed(error)
        }
    }

    // MARK: - Sync Operations

    func fetchPendingSyncConversations() throws -> [Conversation] {
        let context = try getContext()
        let request: NSFetchRequest<CachedConversation> = CachedConversation.fetchRequest()
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

    func upsert(_ model: Conversation) throws {
        if let existing = try fetchEntity(id: model.id) {
            _ = toEntity(model, entity: existing)
        } else {
            _ = try create(model)
        }
    }

    // MARK: - Batch Operations

    func batchUpsert(_ models: [Conversation]) throws {
        let context = try getBackgroundContext()

        context.performAndWait {
            for model in models {
                let request: NSFetchRequest<CachedConversation> = CachedConversation.fetchRequest()
                request.predicate = NSPredicate(format: "id == %@", model.id)
                request.fetchLimit = 1

                let entity: CachedConversation

                if let existing = try? context.fetch(request).first {
                    entity = existing
                } else {
                    entity = CachedConversation(context: context)
                }

                entity.id = model.id
                entity.type = model.type.rawValue
                entity.name = model.title
                entity.unreadCount = Int32(model.unreadCount)
                // Note: createdBy doesn't exist in Conversation model
                entity.avatarURL = model.avatar
                entity.isArchived = model.isArchived
                entity.isMuted = model.isMuted
                entity.createdAt = model.createdAt
                entity.updatedAt = model.updatedAt
                entity.syncedAt = Date()
                entity.needsSync = false
            }

            do {
                try context.save()
            } catch {
                syncLogger.error("Batch upsert failed: \(error)")
            }
        }
    }

    // MARK: - Helper Methods

    private func fetchEntity(id: String) throws -> CachedConversation? {
        let context = try getContext()
        let request: NSFetchRequest<CachedConversation> = CachedConversation.fetchRequest()
        request.predicate = NSPredicate(format: "id == %@", id)
        request.fetchLimit = 1

        return try? context.fetch(request).first
    }

    // MARK: - Model <-> Entity Mapping

    func toModel(_ entity: CachedConversation) -> Conversation? {
        guard let id = entity.id,
              let typeString = entity.type,
              let type = ConversationType(rawValue: typeString),
              let createdAt = entity.createdAt else {
            return nil
        }

        // Fetch members
        var members: [ConversationMember] = []
        if let participantEntities = entity.participants as? Set<CachedParticipant> {
            members = participantEntities.compactMap { participantEntity -> ConversationMember? in
                guard let userId = participantEntity.userId,
                      let roleString = participantEntity.role,
                      let joinedAt = participantEntity.joinedAt else {
                    return nil
                }
                let role = ConversationMemberRole(rawValue: roleString)  // FIX: Non-optional init

                // Get permissions based on role - use default member permissions if no specific data
                let permissions = role.permissions

                return ConversationMember(
                    id: participantEntity.id ?? userId,
                    conversationId: id,
                    userId: userId,
                    role: role,
                    canSendMessage: permissions.canSendMessage,
                    canSendFiles: permissions.canSendFiles,
                    canSendImages: permissions.canSendImages,
                    canSendVideos: permissions.canSendVideos,
                    canSendAudios: permissions.canSendAudios,
                    canSendLocations: permissions.canSendLocations,
                    canSendLinks: permissions.canSendLinks,
                    joinedAt: joinedAt,
                    leftAt: nil,
                    isActive: true,
                    user: nil
                )
            }
        }

        // Fetch last message
        var lastMessage: Message?
        if let lastMessageEntity = entity.lastMessage {
            lastMessage = messageRepository.toModel(lastMessageEntity)
        }

        return Conversation(
            id: id,
            identifier: id,
            type: type,
            title: entity.name,
            description: nil,
            image: nil,
            avatar: entity.avatarURL,
            communityId: nil,
            isActive: true,
            isArchived: entity.isArchived,
            lastMessageAt: entity.updatedAt ?? createdAt,
            createdAt: createdAt,
            updatedAt: entity.updatedAt ?? createdAt,
            members: members.isEmpty ? nil : members,
            lastMessage: lastMessage,
            shareLinks: nil,
            anonymousParticipants: nil,
            userPreferences: nil,
            unreadCount: Int(entity.unreadCount),
            isMuted: entity.isMuted,
            isPinned: false
        )
    }

    func toEntity(_ model: Conversation, entity: CachedConversation?) -> CachedConversation {
        let isNew = entity == nil
        guard let ctx = viewContext ?? coreDataManager.newBackgroundContext() else {
            fatalError("ConversationRepository: Failed to get Core Data context - this should never happen")
        }
        let entity = entity ?? CachedConversation(context: ctx)

        entity.id = model.id
        entity.type = model.type.rawValue
        entity.name = model.title  // Use title as name
        entity.unreadCount = Int32(model.unreadCount)
        // Note: createdBy field doesn't exist in Conversation model
        entity.avatarURL = model.avatar  // Conversation uses 'avatar' not 'avatarURL'
        entity.isArchived = model.isArchived
        entity.isMuted = model.isMuted
        entity.createdAt = model.createdAt
        entity.updatedAt = model.updatedAt
        entity.isSoftDeleted = false

        // Initialize NSSet relationships for new entities to avoid nil insertion errors
        if isNew {
            entity.messages = NSSet()
            entity.participants = NSSet()
            entity.calls = NSSet()
        }

        return entity
    }
}

// MARK: - Publisher Extensions

extension ConversationRepository {
    func conversationsPublisher() -> AnyPublisher<[Conversation], Error> {
        let request: NSFetchRequest<CachedConversation> = CachedConversation.fetchRequest()
        request.predicate = NSPredicate(format: "isSoftDeleted == NO")
        request.sortDescriptors = [NSSortDescriptor(key: "updatedAt", ascending: false)]

        return NotificationCenter.default
            .publisher(for: .NSManagedObjectContextObjectsDidChange, object: viewContext)
            .compactMap { [weak self] _ in
                try? self?.fetchAll()
            }
            .setFailureType(to: Error.self)
            .eraseToAnyPublisher()
    }

    func conversationPublisher(id: String) -> AnyPublisher<Conversation?, Error> {
        let request: NSFetchRequest<CachedConversation> = CachedConversation.fetchRequest()
        request.predicate = NSPredicate(format: "id == %@ AND isSoftDeleted == NO", id)

        return NotificationCenter.default
            .publisher(for: .NSManagedObjectContextObjectsDidChange, object: viewContext)
            .compactMap { [weak self] _ in
                try? self?.fetch(id: id)
            }
            .setFailureType(to: Error.self)
            .eraseToAnyPublisher()
    }
}
