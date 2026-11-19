import Foundation

// MARK: - SocketNotificationEvent → APINotification

public extension SocketNotificationEvent {
    /// Builds the durable `APINotification` form of a real-time `notification:new`
    /// event so it can be written into the local notifications cache and survive an
    /// app restart / offline reopen (the in-app toast alone is ephemeral).
    ///
    /// The mapping is intentionally lossless on what the socket carries and `nil`
    /// elsewhere: the next successful REST refresh overwrites this entry with the
    /// authoritative record, de-duplicated by `id`. `createdAt` is the FALLBACK
    /// clock, injected so the call site owns it (and tests stay deterministic):
    /// the date the gateway serves (`state.createdAt`) wins, so a rewritten
    /// notification keeps its rank instead of looking brand new (#19104).
    func toAPINotification(createdAt: String) -> APINotification {
        let mappedActor: NotificationActor? = {
            guard let actor, let actorId = actor.id else { return nil }
            return NotificationActor(
                id: actorId,
                username: actor.username ?? actor.displayName ?? actorId,
                displayName: actor.displayName,
                avatar: actor.avatar
            )
        }()

        let mappedContext = NotificationContext(
            conversationId: context?.conversationId,
            conversationTitle: context?.conversationTitle,
            conversationType: context?.conversationType,
            conversationAvatar: context?.conversationAvatar,
            messageId: context?.messageId,
            friendRequestId: context?.friendRequestId,
            communityId: context?.communityId,
            postId: context?.postId ?? metadata?.postId,
            commentId: context?.commentId ?? metadata?.commentId,
            parentCommentId: context?.parentCommentId ?? metadata?.parentCommentId,
            postCreatedAt: context?.postCreatedAt,
            postExpiresAt: context?.postExpiresAt
        )

        return APINotification(
            id: id,
            userId: userId,
            type: type,
            priority: priority,
            title: title,
            // Le fil porte enfin le sous-titre (la phrase d'action localisée
            // par la passerelle) : le jeter ici laissait la ligne insérée par
            // le socket muette sur CE QUI venait d'arriver jusqu'au prochain
            // rafraîchissement REST.
            subtitle: subtitle,
            content: content,
            actor: mappedActor,
            context: mappedContext,
            metadata: apiMetadata,
            state: NotificationState(
                isRead: resolvedIsRead ?? false,
                readAt: nil,
                createdAt: wireCreatedAt ?? createdAt,
                expiresAt: nil
            ),
            delivery: nil
        )
    }
}
