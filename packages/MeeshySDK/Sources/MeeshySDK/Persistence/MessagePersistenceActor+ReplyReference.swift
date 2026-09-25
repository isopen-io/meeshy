import Foundation

// Extrait de `MessagePersistenceActor.swift` (2 386 lignes, hors budget
// 1000-1200 — un fichier hors budget est interdit d'ajout). Le lot #4945 fait
// porter à la citation gravée les sept faits du média cité et sa descente de
// Prisme : on extrait d'abord, on ajoute ensuite. Responsabilité tenue ici :
// COMPOSER le blob `replyToJson` d'une ligne ingérée depuis le fil — et rien
// d'autre.

extension MessagePersistenceActor {
    /// Le blob `replyToJson` d'un message ingéré : citation d'un POST (snapshot
    /// figé `postReplyTo`, qui survit à l'expiration — mood : emoji + contenu +
    /// date ; story : aperçu + compteurs) ou citation d'un MESSAGE.
    ///
    /// C'est ce blob qui alimente TOUT rechargement : l'oublier ici ferait
    /// perdre au premier retour de cache — donc au scroll — ce que le chemin
    /// réseau venait de composer. Le chemin message passe par le MÊME
    /// constructeur que `APIMessage.toMessage`
    /// (`APIMessageReplyTo.toReplyReference`) : jumeau CACHE et jumeau RÉSEAU
    /// ne peuvent plus diverger sur le média représentatif, la protection, la
    /// langue servie ni les faits gravés.
    ///
    /// `nonisolated` et pure : appelée depuis la fermeture d'écriture GRDB,
    /// hors de l'isolation de l'actor — elle ne lit que ce qu'on lui remet.
    /// Marquée explicitement comme sa voisine `pendingOutboxMessageIds`, qui
    /// est appelée depuis la même fermeture.
    nonisolated static func replyToJson(
        for api: APIMessage,
        currentUserId: String?,
        preferredLanguages: [String],
        encoder: JSONEncoder,
        quotedDeletedAt: Date? = nil
    ) -> Data? {
        if let story = api.postReplyTo {
            return encoder.encodeOrLog(
                postReplyReference(story),
                field: story.moodEmoji == nil ? "replyToJson(story)" : "replyToJson(mood)",
                id: api.id
            )
        }
        return api.replyTo.flatMap { reply in
            let reference = reply.toReplyReference(currentUserId: currentUserId, preferredLanguages: preferredLanguages)
            return encoder.encodeOrLog(
                quotedDeletedAt.map { reference.tombstoned(at: $0) } ?? reference,
                field: "replyToJson",
                id: api.id
            )
        }
    }

    /// Le blob d'une ligne ingérée, SÉPARÉ de son repli (#7895).
    ///
    /// `served` : la citation que le fil décrit (instantané ou message cité).
    /// `fallback` : la story DISPARUE — seul `storyReplyToId` a voyagé. Le repli
    /// ne comble qu'une case VIDE : un écho allégé ne dégrade jamais une
    /// citation riche déjà gravée, alors qu'un instantané servi remplace un
    /// repli gravé plus tôt.
    struct IngestedReply: Sendable {
        let served: Data?
        let fallback: Data?

        func persisted(over existing: Data?) -> Data? {
            served ?? existing ?? fallback
        }
    }

    nonisolated static func ingestedReply(
        for api: APIMessage,
        currentUserId: String?,
        preferredLanguages: [String],
        encoder: JSONEncoder,
        quotedDeletedAt: Date? = nil
    ) -> IngestedReply {
        let served = replyToJson(for: api, currentUserId: currentUserId,
                                 preferredLanguages: preferredLanguages, encoder: encoder,
                                 quotedDeletedAt: quotedDeletedAt)
        guard served == nil, let storyId = api.storyReplyToId, !storyId.isEmpty else {
            return IngestedReply(served: served, fallback: nil)
        }
        return IngestedReply(
            served: nil,
            fallback: encoder.encodeOrLog(ReplyReference.unavailableStory(storyId: storyId),
                                          field: "replyToJson(story-unavailable)", id: api.id)
        )
    }

    /// `authorAvatarUrl` reste nil, DÉLIBÉRÉMENT : le snapshot `postReplyTo`
    /// ne porte pas d'avatar, et ce nom est vide — aucun profil à ouvrir.
    nonisolated private static func postReplyReference(_ story: APIPostReplyTarget) -> ReplyReference {
        let trimmed = story.previewText.trimmingCharacters(in: .whitespacesAndNewlines)
        if let emoji = story.moodEmoji {
            return ReplyReference(
                messageId: story.id,
                authorName: "",
                previewText: trimmed,
                isMe: false,
                isStoryReply: true,
                storyPublishedAt: story.createdAt,
                moodEmoji: emoji
            )
        }
        return ReplyReference(
            messageId: story.id,
            authorName: "",
            previewText: trimmed.isEmpty ? "\u{1F4F7} Story" : trimmed,
            isMe: false,
            isStoryReply: true,
            storyPublishedAt: story.createdAt,
            storyReactionCount: story.reactionCount,
            storyCommentCount: story.commentCount,
            storyShareCount: story.shareCount,
            storyThumbnailUrl: story.thumbnailUrl
        )
    }
}
