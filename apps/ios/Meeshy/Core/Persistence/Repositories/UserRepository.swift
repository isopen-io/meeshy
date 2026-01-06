//
//  UserRepository.swift
//  Meeshy
//
//  Offline-first repository for user data access
//

import Foundation
import CoreData
import Combine

final class UserRepository: BaseRepository {
    typealias Entity = CachedUser
    typealias Model = User

    // MARK: - Properties

    let coreDataManager: CoreDataManager

    // MARK: - Initialization

    init(coreDataManager: CoreDataManager = .shared) {
        self.coreDataManager = coreDataManager
    }

    // MARK: - CRUD Operations

    func create(_ model: User) throws -> CachedUser {
        let context = try getContext()
        let entity = CachedUser(context: context)

        _ = toEntity(model, entity: entity)

        try save(context: context)
        return entity
    }

    func fetch(id: String) throws -> User? {
        let context = try getContext()
        let request: NSFetchRequest<CachedUser> = CachedUser.fetchRequest()
        request.predicate = NSPredicate(format: "id == %@", id)
        request.fetchLimit = 1

        do {
            let results = try context.fetch(request)
            return results.first.flatMap { toModel($0) }
        } catch {
            throw RepositoryError.fetchFailed(error)
        }
    }

    func fetchAll() throws -> [User] {
        let context = try getContext()
        let request: NSFetchRequest<CachedUser> = CachedUser.fetchRequest()
        request.sortDescriptors = [NSSortDescriptor(key: "username", ascending: true)]

        do {
            let results = try context.fetch(request)
            return results.compactMap { toModel($0) }
        } catch {
            throw RepositoryError.fetchFailed(error)
        }
    }

    func update(id: String, with model: User) throws {
        guard let entity = try fetchEntity(id: id) else {
            throw RepositoryError.notFound
        }

        _ = toEntity(model, entity: entity)
        entity.needsSync = true

        try save()
    }

    func delete(id: String) throws {
        let context = try getContext()
        guard let entity = try fetchEntity(id: id) else {
            throw RepositoryError.notFound
        }

        context.delete(entity)
        try save()
    }

    func deleteAll() throws {
        let context = try getContext()
        let request: NSFetchRequest<NSFetchRequestResult> = CachedUser.fetchRequest()
        let deleteRequest = NSBatchDeleteRequest(fetchRequest: request)

        do {
            try context.execute(deleteRequest)
            try save()
        } catch {
            throw RepositoryError.deleteFailed(error)
        }
    }

    // MARK: - User-Specific Methods

    func fetchByUsername(_ username: String) throws -> User? {
        let context = try getContext()
        let request: NSFetchRequest<CachedUser> = CachedUser.fetchRequest()
        request.predicate = NSPredicate(format: "username == %@", username)
        request.fetchLimit = 1

        do {
            let results = try context.fetch(request)
            return results.first.flatMap { toModel($0) }
        } catch {
            throw RepositoryError.fetchFailed(error)
        }
    }

    func fetchByEmail(_ email: String) throws -> User? {
        let context = try getContext()
        let request: NSFetchRequest<CachedUser> = CachedUser.fetchRequest()
        request.predicate = NSPredicate(format: "email == %@", email)
        request.fetchLimit = 1

        do {
            let results = try context.fetch(request)
            return results.first.flatMap { toModel($0) }
        } catch {
            throw RepositoryError.fetchFailed(error)
        }
    }

    func fetchOnlineUsers() throws -> [User] {
        let context = try getContext()
        let request: NSFetchRequest<CachedUser> = CachedUser.fetchRequest()
        request.predicate = NSPredicate(format: "isOnline == YES")
        request.sortDescriptors = [NSSortDescriptor(key: "username", ascending: true)]

        do {
            let results = try context.fetch(request)
            return results.compactMap { toModel($0) }
        } catch {
            throw RepositoryError.fetchFailed(error)
        }
    }

    func updateOnlineStatus(id: String, isOnline: Bool) throws {
        guard let entity = try fetchEntity(id: id) else {
            throw RepositoryError.notFound
        }

        entity.isOnline = isOnline
        entity.lastSeen = isOnline ? nil : Date()
        entity.needsSync = true

        try save()
    }

    func searchUsers(query: String) throws -> [User] {
        let context = try getContext()
        let request: NSFetchRequest<CachedUser> = CachedUser.fetchRequest()
        request.predicate = NSPredicate(
            format: "username CONTAINS[cd] %@ OR displayName CONTAINS[cd] %@ OR email CONTAINS[cd] %@",
            query, query, query
        )
        request.sortDescriptors = [NSSortDescriptor(key: "username", ascending: true)]

        do {
            let results = try context.fetch(request)
            return results.compactMap { toModel($0) }
        } catch {
            throw RepositoryError.fetchFailed(error)
        }
    }

    // MARK: - Sync Operations

    func fetchPendingSyncUsers() throws -> [User] {
        let context = try getContext()
        let request: NSFetchRequest<CachedUser> = CachedUser.fetchRequest()
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

    func upsert(_ model: User) throws {
        if let existing = try fetchEntity(id: model.id) {
            _ = toEntity(model, entity: existing)
        } else {
            _ = try create(model)
        }
    }

    // MARK: - Batch Operations

    func batchUpsert(_ models: [User]) throws {
        let context = try getBackgroundContext()

        context.performAndWait {
            for model in models {
                let request: NSFetchRequest<CachedUser> = CachedUser.fetchRequest()
                request.predicate = NSPredicate(format: "id == %@", model.id)
                request.fetchLimit = 1

                let entity: CachedUser

                if let existing = try? context.fetch(request).first {
                    entity = existing
                } else {
                    entity = CachedUser(context: context)
                }

                entity.id = model.id
                entity.username = model.username
                entity.email = model.email
                entity.displayName = model.displayName
                entity.avatarURL = model.avatar
                entity.bio = model.bio
                entity.phoneNumber = model.phoneNumber
                entity.preferredLanguage = model.systemLanguage
                entity.isOnline = model.isOnline
                entity.lastSeen = model.lastSeen
                entity.createdAt = model.createdAt
                entity.updatedAt = model.updatedAt
                entity.twoFactorEnabled = model.isTwoFactorEnabled
                entity.biometricEnabled = false  // Biometric is device-specific, not synced
                entity.notificationsEnabled = true  // Default value, not in new User model
                entity.translationEnabled = true  // Default value, not in new User model
                entity.autoTranslateEnabled = model.autoTranslateEnabled
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

    private func fetchEntity(id: String) throws -> CachedUser? {
        let context = try getContext()
        let request: NSFetchRequest<CachedUser> = CachedUser.fetchRequest()
        request.predicate = NSPredicate(format: "id == %@", id)
        request.fetchLimit = 1

        return try? context.fetch(request).first
    }

    // MARK: - Model <-> Entity Mapping

    func toModel(_ entity: CachedUser) -> User? {
        guard let id = entity.id,
              let username = entity.username,
              let email = entity.email,
              let preferredLanguage = entity.preferredLanguage,
              let createdAt = entity.createdAt else {
            return nil
        }

        return User(
            id: id,
            username: username,
            firstName: "",  // Not stored in cache
            lastName: "",   // Not stored in cache
            bio: entity.bio ?? "",
            email: email,
            phoneNumber: entity.phoneNumber,
            displayName: entity.displayName,
            avatar: entity.avatarURL,
            isOnline: entity.isOnline,
            lastSeen: entity.lastSeen,
            lastActiveAt: entity.lastSeen,
            systemLanguage: preferredLanguage,
            regionalLanguage: "fr",  // Default
            customDestinationLanguage: nil,
            autoTranslateEnabled: entity.autoTranslateEnabled,
            translateToSystemLanguage: true,
            translateToRegionalLanguage: false,
            useCustomDestination: false,
            role: .user,
            isActive: true,
            deactivatedAt: nil,
            emailVerifiedAt: nil,
            phoneVerifiedAt: nil,
            twoFactorEnabledAt: entity.twoFactorEnabled ? Date() : nil,
            twoFactorSecret: nil,
            failedLoginAttempts: 0,
            lockedUntil: nil,
            lockedReason: nil,
            lastPasswordChange: Date(),
            passwordResetAttempts: 0,
            lastPasswordResetAttempt: nil,
            lastLoginIp: nil,
            lastLoginLocation: nil,
            lastLoginDevice: nil,
            deletedAt: nil,
            deletedBy: nil,
            profileCompletionRate: nil,
            createdAt: createdAt,
            updatedAt: entity.updatedAt ?? createdAt
        )
    }

    func toEntity(_ model: User, entity: CachedUser?) -> CachedUser {
        let isNew = entity == nil
        guard let ctx = viewContext ?? coreDataManager.newBackgroundContext() else {
            fatalError("UserRepository: Failed to get Core Data context - this should never happen")
        }
        let entity = entity ?? CachedUser(context: ctx)

        entity.id = model.id
        entity.username = model.username
        entity.email = model.email
        entity.displayName = model.displayName
        entity.avatarURL = model.avatar
        entity.bio = model.bio
        entity.phoneNumber = model.phoneNumber
        entity.preferredLanguage = model.systemLanguage
        entity.isOnline = model.isOnline
        entity.lastSeen = model.lastSeen
        entity.createdAt = model.createdAt
        entity.updatedAt = model.updatedAt
        entity.twoFactorEnabled = model.isTwoFactorEnabled
        entity.biometricEnabled = false  // Device-specific, not synced
        entity.notificationsEnabled = true  // Default
        entity.translationEnabled = true  // Default
        entity.autoTranslateEnabled = model.autoTranslateEnabled

        // Initialize NSSet relationships for new entities to avoid nil insertion errors
        if isNew {
            entity.sentMessages = NSSet()
            entity.participations = NSSet()
            entity.readReceipts = NSSet()
            entity.callerOfCalls = NSSet()
            entity.participatedCalls = NSSet()
        }

        return entity
    }
}

// MARK: - Publisher Extensions

extension UserRepository {
    func userPublisher(id: String) -> AnyPublisher<User?, Error> {
        let request: NSFetchRequest<CachedUser> = CachedUser.fetchRequest()
        request.predicate = NSPredicate(format: "id == %@", id)

        return NotificationCenter.default
            .publisher(for: .NSManagedObjectContextObjectsDidChange, object: viewContext)
            .compactMap { [weak self] _ in
                try? self?.fetch(id: id)
            }
            .setFailureType(to: Error.self)
            .eraseToAnyPublisher()
    }
}
