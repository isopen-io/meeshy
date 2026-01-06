//
//  CoreDataEntities.swift
//  Meeshy
//
//  Core Data entity definitions for offline-first architecture
//  Production-ready with CloudKit sync support
//

import Foundation
import CoreData

// MARK: - CachedUser Entity

@objc(CachedUser)
public class CachedUser: NSManagedObject {
    @NSManaged public var id: String?
    @NSManaged public var username: String?
    @NSManaged public var firstName: String?
    @NSManaged public var lastName: String?
    @NSManaged public var email: String?
    @NSManaged public var displayName: String?
    @NSManaged public var avatarURL: String?
    @NSManaged public var bio: String?
    @NSManaged public var phoneNumber: String?
    @NSManaged public var preferredLanguage: String?
    @NSManaged public var isOnline: Bool
    @NSManaged public var lastSeen: Date?
    @NSManaged public var createdAt: Date?
    @NSManaged public var updatedAt: Date?

    // Security
    @NSManaged public var twoFactorEnabled: Bool
    @NSManaged public var biometricEnabled: Bool

    // Settings
    @NSManaged public var notificationsEnabled: Bool
    @NSManaged public var translationEnabled: Bool
    @NSManaged public var autoTranslateEnabled: Bool

    // Sync metadata
    @NSManaged public var syncedAt: Date?
    @NSManaged public var serverVersion: Int64
    @NSManaged public var needsSync: Bool

    // Inverse relationships
    @NSManaged public var sentMessages: NSSet?
    @NSManaged public var participations: NSSet?
    @NSManaged public var readReceipts: NSSet?
    @NSManaged public var callerOfCalls: NSSet?
    @NSManaged public var participatedCalls: NSSet?
}

// MARK: - CachedConversation Entity

@objc(CachedConversation)
public class CachedConversation: NSManagedObject {
    @NSManaged public var id: String?
    @NSManaged public var type: String?
    @NSManaged public var name: String?
    @NSManaged public var unreadCount: Int32
    @NSManaged public var createdBy: String?
    @NSManaged public var avatarURL: String?
    @NSManaged public var isArchived: Bool
    @NSManaged public var isMuted: Bool
    @NSManaged public var createdAt: Date?
    @NSManaged public var updatedAt: Date?

    // Relationships
    @NSManaged public var messages: NSSet?
    @NSManaged public var participants: NSSet?
    @NSManaged public var lastMessage: CachedMessage?
    @NSManaged public var calls: NSSet?

    // Sync metadata
    @NSManaged public var syncedAt: Date?
    @NSManaged public var serverVersion: Int64
    @NSManaged public var needsSync: Bool
    @NSManaged public var isSoftDeleted: Bool
}

// MARK: - CachedMessage Entity

@objc(CachedMessage)
public class CachedMessage: NSManagedObject {
    @NSManaged public var id: String?
    @NSManaged public var conversationId: String?
    @NSManaged public var senderId: String?
    @NSManaged public var content: String?
    @NSManaged public var type: String?
    @NSManaged public var status: String?
    @NSManaged public var isEdited: Bool
    @NSManaged public var editedAt: Date?
    @NSManaged public var replyToId: String?
    @NSManaged public var createdAt: Date?
    @NSManaged public var updatedAt: Date?

    // Local properties
    @NSManaged public var localId: String?
    @NSManaged public var isSending: Bool
    @NSManaged public var sendError: String?

    // Relationships
    @NSManaged public var conversation: CachedConversation?
    @NSManaged public var attachments: NSSet?
    @NSManaged public var translations: NSSet?
    @NSManaged public var readReceipts: NSSet?
    @NSManaged public var sender: CachedUser?
    @NSManaged public var isLastMessageOf: CachedConversation?

    // Sync metadata
    @NSManaged public var syncedAt: Date?
    @NSManaged public var serverVersion: Int64
    @NSManaged public var needsSync: Bool
    @NSManaged public var isSoftDeleted: Bool
}

// MARK: - CachedAttachment Entity

@objc(CachedAttachment)
public class CachedAttachment: NSManagedObject {
    @NSManaged public var id: String?
    @NSManaged public var messageId: String?
    @NSManaged public var uploadedBy: String?
    @NSManaged public var filename: String?
    @NSManaged public var mimeType: String?
    @NSManaged public var size: Int64
    @NSManaged public var url: String?
    @NSManaged public var thumbnailURL: String?
    @NSManaged public var width: Int32
    @NSManaged public var height: Int32
    @NSManaged public var duration: Double
    @NSManaged public var createdAt: Date?

    // Local properties
    @NSManaged public var localURL: String?
    @NSManaged public var uploadProgress: Double
    @NSManaged public var isUploading: Bool
    @NSManaged public var uploadError: String?

    // Relationships
    @NSManaged public var message: CachedMessage?

    // Sync metadata
    @NSManaged public var syncedAt: Date?
    @NSManaged public var needsSync: Bool
}

// MARK: - CachedTranslation Entity

@objc(CachedTranslation)
public class CachedTranslation: NSManagedObject {
    @NSManaged public var id: String?
    @NSManaged public var messageId: String?
    @NSManaged public var sourceLanguage: String?
    @NSManaged public var targetLanguage: String?
    @NSManaged public var translatedContent: String?
    @NSManaged public var detectedLanguage: String?
    @NSManaged public var translatedBy: String?
    @NSManaged public var createdAt: Date?

    // Relationships
    @NSManaged public var message: CachedMessage?

    // Sync metadata
    @NSManaged public var syncedAt: Date?
    @NSManaged public var needsSync: Bool
}

// MARK: - CachedParticipant Entity

@objc(CachedParticipant)
public class CachedParticipant: NSManagedObject {
    @NSManaged public var id: String?
    @NSManaged public var userId: String?
    @NSManaged public var conversationId: String?
    @NSManaged public var role: String?
    @NSManaged public var joinedAt: Date?
    @NSManaged public var lastReadAt: Date?

    // Relationships
    @NSManaged public var conversation: CachedConversation?
    @NSManaged public var user: CachedUser?
}

// MARK: - CachedReadReceipt Entity

@objc(CachedReadReceipt)
public class CachedReadReceipt: NSManagedObject {
    @NSManaged public var id: String?
    @NSManaged public var messageId: String?
    @NSManaged public var userId: String?
    @NSManaged public var readAt: Date?

    // Relationships
    @NSManaged public var message: CachedMessage?
    @NSManaged public var user: CachedUser?
}

// MARK: - PendingOperation Entity

@objc(PendingOperation)
public class PendingOperation: NSManagedObject {
    @NSManaged public var id: String?
    @NSManaged public var type: String?
    @NSManaged public var entityType: String?
    @NSManaged public var entityId: String?
    @NSManaged public var payload: Data?
    @NSManaged public var createdAt: Date?
    @NSManaged public var attemptCount: Int32
    @NSManaged public var lastAttemptAt: Date?
    @NSManaged public var error: String?
    @NSManaged public var priority: Int16
    @NSManaged public var status: String?

    // Computed
    var isRetryable: Bool {
        return attemptCount < 3 && status != "completed"
    }
}

// MARK: - SyncMetadata Entity

@objc(SyncMetadata)
public class SyncMetadata: NSManagedObject {
    @NSManaged public var key: String?
    @NSManaged public var lastSyncDate: Date?
    @NSManaged public var syncToken: String?
    @NSManaged public var entityType: String?
    @NSManaged public var batchSize: Int32
    @NSManaged public var totalSynced: Int64
}

// MARK: - CachedNotification Entity

@objc(CachedNotification)
public class CachedNotification: NSManagedObject {
    @NSManaged public var id: String?
    @NSManaged public var userId: String?
    @NSManaged public var type: String?
    @NSManaged public var title: String?
    @NSManaged public var body: String?
    @NSManaged public var data: Data?
    @NSManaged public var isRead: Bool
    @NSManaged public var createdAt: Date?

    // Sync metadata
    @NSManaged public var syncedAt: Date?
    @NSManaged public var needsSync: Bool
}

// MARK: - CachedCall Entity

@objc(CachedCall)
public class CachedCall: NSManagedObject {
    @NSManaged public var id: String?
    @NSManaged public var conversationId: String?
    @NSManaged public var callerId: String?
    @NSManaged public var type: String? // audio, video
    @NSManaged public var status: String? // ringing, ongoing, ended, missed
    @NSManaged public var startedAt: Date?
    @NSManaged public var endedAt: Date?
    @NSManaged public var duration: Int32

    // Relationships
    @NSManaged public var conversation: CachedConversation?
    @NSManaged public var caller: CachedUser?
    @NSManaged public var participants: NSSet?

    // Sync metadata
    @NSManaged public var syncedAt: Date?
    @NSManaged public var needsSync: Bool
}

// MARK: - Extension Helpers

extension CachedConversation {
    @objc(addMessagesObject:)
    @NSManaged public func addToMessages(_ value: CachedMessage)

    @objc(removeMessagesObject:)
    @NSManaged public func removeFromMessages(_ value: CachedMessage)

    @objc(addMessages:)
    @NSManaged public func addToMessages(_ values: NSSet)

    @objc(removeMessages:)
    @NSManaged public func removeFromMessages(_ values: NSSet)

    @objc(addParticipantsObject:)
    @NSManaged public func addToParticipants(_ value: CachedParticipant)

    @objc(removeParticipantsObject:)
    @NSManaged public func removeFromParticipants(_ value: CachedParticipant)
}

extension CachedMessage {
    @objc(addAttachmentsObject:)
    @NSManaged public func addToAttachments(_ value: CachedAttachment)

    @objc(removeAttachmentsObject:)
    @NSManaged public func removeFromAttachments(_ value: CachedAttachment)

    @objc(addTranslationsObject:)
    @NSManaged public func addToTranslations(_ value: CachedTranslation)

    @objc(removeTranslationsObject:)
    @NSManaged public func removeFromTranslations(_ value: CachedTranslation)

    @objc(addReadReceiptsObject:)
    @NSManaged public func addToReadReceipts(_ value: CachedReadReceipt)

    @objc(removeReadReceiptsObject:)
    @NSManaged public func removeFromReadReceipts(_ value: CachedReadReceipt)
}

extension CachedCall {
    @objc(addParticipantsObject:)
    @NSManaged public func addToParticipants(_ value: CachedUser)

    @objc(removeParticipantsObject:)
    @NSManaged public func removeFromParticipants(_ value: CachedUser)
}
