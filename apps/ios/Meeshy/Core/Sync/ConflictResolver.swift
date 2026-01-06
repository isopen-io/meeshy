//
//  ConflictResolver.swift
//  Meeshy
//
//  Conflict resolution strategies for data synchronization
//  Supports multiple strategies: server-wins, client-wins, last-write-wins, manual
//

import Foundation
import CoreData

enum ConflictResolutionStrategy {
    case serverWins      // Server data always takes precedence
    case clientWins      // Client data always takes precedence
    case lastWriteWins   // Most recent update wins based on timestamp
    case manual          // Requires manual resolution by user
    case mergeFields     // Intelligently merge non-conflicting fields
}

protocol ConflictResolvable {
    var id: String { get }
    var updatedAt: Date { get }
    var serverVersion: Int64 { get }
}

final class ConflictResolver: @unchecked Sendable {
    // MARK: - Singleton

    nonisolated(unsafe) static let shared = ConflictResolver()

    // MARK: - Properties

    private let strategy: ConflictResolutionStrategy

    // Closure for manual conflict resolution
    var manualResolutionHandler: ((Any, Any) -> Any?)?

    // MARK: - Initialization

    init(strategy: ConflictResolutionStrategy = .lastWriteWins) {
        self.strategy = strategy
    }

    // MARK: - Conflict Detection

    func hasConflict<T: ConflictResolvable>(local: T, remote: T) -> Bool {
        // No conflict if versions match
        if local.serverVersion == remote.serverVersion {
            return false
        }

        // Conflict if both have been modified
        if local.serverVersion > 0 && remote.serverVersion > local.serverVersion {
            return true
        }

        return false
    }

    // MARK: - Conflict Resolution

    func resolve<T>(
        local: T,
        remote: T,
        strategy: ConflictResolutionStrategy? = nil
    ) -> ConflictResolution<T> {
        let resolutionStrategy = strategy ?? self.strategy

        switch resolutionStrategy {
        case .serverWins:
            return .useRemote(remote)

        case .clientWins:
            return .useLocal(local)

        case .lastWriteWins:
            return resolveByLastWrite(local: local, remote: remote)

        case .manual:
            return resolveManually(local: local, remote: remote)

        case .mergeFields:
            return mergeFields(local: local, remote: remote)
        }
    }

    // MARK: - Resolution Strategies

    private func resolveByLastWrite<T>(local: T, remote: T) -> ConflictResolution<T> {
        guard let localUpdatable = local as? ConflictResolvable,
              let remoteUpdatable = remote as? ConflictResolvable else {
            return .useRemote(remote)
        }

        if localUpdatable.updatedAt > remoteUpdatable.updatedAt {
            syncLogger.info("Conflict resolved: Local wins (newer timestamp)")
            return .useLocal(local)
        } else {
            syncLogger.info("Conflict resolved: Remote wins (newer timestamp)")
            return .useRemote(remote)
        }
    }

    private func resolveManually<T>(local: T, remote: T) -> ConflictResolution<T> {
        guard let handler = manualResolutionHandler,
              let resolved = handler(local, remote) as? T else {
            syncLogger.warn("No manual resolution handler, defaulting to remote")
            return .useRemote(remote)
        }

        syncLogger.info("Conflict resolved manually")
        return .useMerged(resolved)
    }

    private func mergeFields<T>(local: T, remote: T) -> ConflictResolution<T> {
        // Attempt intelligent field-level merge
        switch (local, remote) {
        case (let localMsg as Message, let remoteMsg as Message):
            if let merged = mergeMessages(local: localMsg, remote: remoteMsg) as? T {
                return .useMerged(merged)
            }

        case (let localConv as Conversation, let remoteConv as Conversation):
            if let merged = mergeConversations(local: localConv, remote: remoteConv) as? T {
                return .useMerged(merged)
            }

        case (let localUser as User, let remoteUser as User):
            if let merged = mergeUsers(local: localUser, remote: remoteUser) as? T {
                return .useMerged(merged)
            }

        default:
            break
        }

        // Fallback to last-write-wins if merge not possible
        return resolveByLastWrite(local: local, remote: remote)
    }

    // MARK: - Type-Specific Merging

    private func mergeMessages(local: Message, remote: Message) -> Message {
        var merged = remote

        // Keep local edits if newer
        if local.isEdited && local.updatedAt > remote.updatedAt {
            merged.content = local.content
            merged.isEdited = local.isEdited
            merged.editedAt = local.editedAt
        }

        // Use most advanced status (compare delivery status enums)
        if local.deliveryStatus.rawValue > remote.deliveryStatus.rawValue {
            merged.status = local.status
        } else {
            merged.status = remote.status
        }

        // NOTE: translations field is excluded for MVP - skip merging

        syncLogger.debug("Messages merged successfully")
        return merged
    }

    private func mergeConversations(local: Conversation, remote: Conversation) -> Conversation {
        var merged = remote

        // Use local settings if modified more recently
        if local.updatedAt > remote.updatedAt {
            merged.isArchived = local.isArchived
            merged.isMuted = local.isMuted
        }

        // Use local unread count (client knows best)
        merged.unreadCount = local.unreadCount

        // Merge members (union) - Note: members don't have lastReadAt in ConversationMember model
        if let remoteMembers = remote.members, let localMembers = local.members {
            var memberMap: [String: ConversationMember] = [:]
            for member in remoteMembers {
                memberMap[member.userId] = member
            }
            for member in localMembers {
                if memberMap[member.userId] == nil {
                    memberMap[member.userId] = member
                }
                // Use remote member data if it exists (server is source of truth for member state)
            }
            merged.members = Array(memberMap.values)
        } else {
            merged.members = remote.members ?? local.members
        }

        syncLogger.debug("Conversations merged successfully")
        return merged
    }

    private func mergeUsers(local: User, remote: User) -> User {
        var merged = remote

        // Prefer local for user preferences
        merged.systemLanguage = local.systemLanguage
        merged.regionalLanguage = local.regionalLanguage
        merged.customDestinationLanguage = local.customDestinationLanguage
        merged.autoTranslateEnabled = local.autoTranslateEnabled
        merged.translateToSystemLanguage = local.translateToSystemLanguage
        merged.translateToRegionalLanguage = local.translateToRegionalLanguage
        merged.useCustomDestination = local.useCustomDestination

        // Use remote for profile data if newer
        if remote.updatedAt > local.updatedAt {
            merged.displayName = remote.displayName
            merged.avatar = remote.avatar
            merged.bio = remote.bio
            merged.firstName = remote.firstName
            merged.lastName = remote.lastName
        } else {
            merged.displayName = local.displayName
            merged.avatar = local.avatar
            merged.bio = local.bio
            merged.firstName = local.firstName
            merged.lastName = local.lastName
        }

        // Always use remote for online status and activity
        merged.isOnline = remote.isOnline
        merged.lastSeen = remote.lastSeen
        merged.lastActiveAt = remote.lastActiveAt

        syncLogger.debug("Users merged successfully")
        return merged
    }

    // MARK: - Batch Conflict Resolution

    func resolveBatch<T>(
        conflicts: [(local: T, remote: T)],
        strategy: ConflictResolutionStrategy? = nil
    ) -> [ConflictResolution<T>] {
        return conflicts.map { conflict in
            resolve(local: conflict.local, remote: conflict.remote, strategy: strategy)
        }
    }

    // MARK: - Conflict Logging

    func logConflict<T: ConflictResolvable>(
        local: T,
        remote: T,
        resolution: ConflictResolution<T>
    ) {
        let resolutionType = switch resolution {
        case .useLocal: "LOCAL"
        case .useRemote: "REMOTE"
        case .useMerged: "MERGED"
        case .needsManualResolution: "MANUAL"
        }

        syncLogger.info("""
            Conflict detected and resolved:
            - Entity ID: \(local.id)
            - Local version: \(local.serverVersion), updated: \(local.updatedAt)
            - Remote version: \(remote.serverVersion), updated: \(remote.updatedAt)
            - Resolution: \(resolutionType)
            """)
    }
}

// MARK: - Conflict Resolution Result

enum ConflictResolution<T> {
    case useLocal(T)
    case useRemote(T)
    case useMerged(T)
    case needsManualResolution(local: T, remote: T)

    var resolved: T? {
        switch self {
        case .useLocal(let value), .useRemote(let value), .useMerged(let value):
            return value
        case .needsManualResolution:
            return nil
        }
    }
}

// MARK: - Model Extensions for Conflict Resolution

extension Message: ConflictResolvable {
    var serverVersion: Int64 { 0 } // Will be populated from CoreData entity
}

extension Conversation: ConflictResolvable {
    var serverVersion: Int64 { 0 } // Will be populated from CoreData entity
}

extension User: ConflictResolvable {
    var serverVersion: Int64 { 0 } // Will be populated from CoreData entity
}
