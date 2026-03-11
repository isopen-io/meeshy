import Foundation
import GRDB

struct DBCachedParticipant: Codable, FetchableRecord, PersistableRecord, Sendable {
    static let databaseTableName = "cached_participants"

    var id: String
    var conversationId: String
    var userId: String?
    var username: String?
    var firstName: String?
    var lastName: String?
    var displayName: String?
    var avatar: String?
    var conversationRole: String?
    var isOnline: Bool?
    var lastActiveAt: Date?
    var joinedAt: Date?
    var isActive: Bool?
    var cachedAt: Date

    func toPaginatedParticipant() -> PaginatedParticipant {
        PaginatedParticipant(
            id: id, userId: userId, username: username,
            firstName: firstName, lastName: lastName,
            displayName: displayName, avatar: avatar,
            conversationRole: conversationRole, isOnline: isOnline,
            lastActiveAt: lastActiveAt, joinedAt: joinedAt, isActive: isActive
        )
    }

    static func from(_ participant: PaginatedParticipant, conversationId: String) -> DBCachedParticipant {
        DBCachedParticipant(
            id: participant.id, conversationId: conversationId,
            userId: participant.userId, username: participant.username,
            firstName: participant.firstName, lastName: participant.lastName,
            displayName: participant.displayName, avatar: participant.avatar,
            conversationRole: participant.conversationRole, isOnline: participant.isOnline,
            lastActiveAt: participant.lastActiveAt, joinedAt: participant.joinedAt,
            isActive: participant.isActive, cachedAt: Date()
        )
    }
}
