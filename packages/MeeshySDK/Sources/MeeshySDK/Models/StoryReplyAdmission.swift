import Foundation

/// Où une réponse à une story ou à une humeur a le droit de vivre (#7883).
///
/// Une telle réponse s'adresse à l'AUTEUR : elle n'est admissible que dans la
/// conversation DIRECTE dont le participant est cet auteur. Le contexte qui la
/// porte (`Router.pendingReplyContext`) est global et survit à une navigation
/// ratée ; sans cette loi, la prochaine conversation ouverte — un groupe, le DM
/// d'un tiers — recevait la citation, l'envoyait avec `storyReplyToId` et la
/// gravait dans son brouillon.
///
/// Fail-closed : un identifiant absent ou vide ne s'égale jamais.
public enum StoryReplyAdmission {
    public static func admits(storyAuthorId: String?, conversationIsDirect: Bool, participantUserId: String?) -> Bool {
        guard conversationIsDirect,
              let storyAuthorId, !storyAuthorId.isEmpty,
              let participantUserId, !participantUserId.isEmpty else { return false }
        return storyAuthorId == participantUserId
    }
}

public extension ReplyContext {
    func isAdmissible(conversationIsDirect: Bool, participantUserId: String?) -> Bool {
        StoryReplyAdmission.admits(storyAuthorId: authorId, conversationIsDirect: conversationIsDirect, participantUserId: participantUserId)
    }
}

public extension ReplyReference {
    /// Une citation de MESSAGE naît du fil courant et y reste admise ; une
    /// citation de story ou d'humeur répond à la loi, sur l'auteur qu'elle a
    /// gravé — sans lui, elle est refusée.
    func isAdmissible(conversationIsDirect: Bool, participantUserId: String?) -> Bool {
        guard isStoryReply else { return true }
        return StoryReplyAdmission.admits(storyAuthorId: storyAuthorId, conversationIsDirect: conversationIsDirect, participantUserId: participantUserId)
    }
}

/// Ce qu'un envoi transmet de la citation en attente : `replyToId` pour un
/// message, `storyReplyToId` (et la citation, pour la bulle optimiste) pour une
/// story ou une humeur. Une citation non admissible dans la conversation
/// courante ne transmet RIEN — défense en profondeur derrière l'application du
/// contexte.
public struct OutgoingReplyRoute: Equatable, Sendable {
    public let replyToId: String?
    public let storyReplyToId: String?
    public let storyReference: ReplyReference?

    public var hasReply: Bool { replyToId != nil || storyReplyToId != nil }

    public init(pending: ReplyReference?, conversationIsDirect: Bool, participantUserId: String?) {
        guard let pending, !pending.messageId.isEmpty,
              pending.isAdmissible(conversationIsDirect: conversationIsDirect, participantUserId: participantUserId) else {
            self.replyToId = nil
            self.storyReplyToId = nil
            self.storyReference = nil
            return
        }
        self.replyToId = pending.isStoryReply ? nil : pending.messageId
        self.storyReplyToId = pending.isStoryReply ? pending.messageId : nil
        self.storyReference = pending.isStoryReply ? pending : nil
    }
}
