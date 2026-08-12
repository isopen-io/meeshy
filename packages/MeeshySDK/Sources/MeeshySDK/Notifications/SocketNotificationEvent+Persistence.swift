import Foundation

// MARK: - SocketNotificationEvent → APINotification

public extension SocketNotificationEvent {
    /// Builds the durable `APINotification` form of a real-time `notification:new`
    /// event so it can be written into the local notifications cache and survive an
    /// app restart / offline reopen (the in-app toast alone is ephemeral).
    ///
    /// The mapping is intentionally lossless on what the socket carries and `nil`
    /// elsewhere (notably `metadata`, which has no public memberwise initializer):
    /// the next successful REST refresh overwrites this entry with the authoritative
    /// record, de-duplicated by `id`. `createdAt` is injected so the call site owns
    /// the clock (and tests stay deterministic).
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
            postId: context?.postId ?? metadata?.postId,
            commentId: context?.commentId ?? metadata?.commentId,
            parentCommentId: context?.parentCommentId ?? metadata?.parentCommentId
        )

        return APINotification(
            id: id,
            userId: userId,
            type: type,
            priority: priority,
            title: title,
            subtitle: nil,
            content: content,
            actor: mappedActor,
            context: mappedContext,
            metadata: nil,
            state: NotificationState(
                isRead: isRead ?? false,
                readAt: nil,
                createdAt: createdAt,
                expiresAt: nil
            ),
            delivery: nil
        )
    }
}
