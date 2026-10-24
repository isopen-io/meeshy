import Combine

/// Le contrat entrant de la socket sociale. Il n'y a pas d'écouteur `comment:reaction-sync` ni `post:reaction-sync` :
/// la passerelle ne les diffuse jamais, ces synchronisations reviennent par l'ACK de `*:reaction-request-sync`. Les
/// toasts `notification:new` passent par `MessageSocketManager.notificationReceived` : un second décodage ici serait
/// du travail mort et un risque de double toast.
enum SocialSocketRoutes {

    static func all(for manager: SocialSocketManager) -> [SocketInboundRoute] {
        let groups: [[SocketInboundRoute]] = [
            posts(manager),
            stories(manager),
            statuses(manager),
            comments(manager),
            conversationLifecycle(manager),
        ]
        return groups.flatMap { $0 }
    }

    static func posts(_ m: SocialSocketManager) -> [SocketInboundRoute] {
        [
            m.route(.postCreated, SocketPostCreatedData.self) { $0.postCreated.send($1) },
            m.route(.postUpdated, SocketPostUpdatedData.self) { $0.postUpdated.send($1.post) },
            m.route(.postDeleted, SocketPostDeletedData.self) { $0.postDeleted.send($1.postId) },
            m.route(.postLiked, SocketPostLikedData.self) { $0.postLiked.send($1) },
            m.route(.postUnliked, SocketPostUnlikedData.self) { $0.postUnliked.send($1) },
            m.route(.postReposted, SocketPostRepostedData.self) { $0.postReposted.send($1) },
            m.route(.postBookmarked, SocketPostBookmarkedData.self) { $0.postBookmarked.send($1) },
            m.route(.postReactionAdded, SocketPostReactionUpdateEvent.self) { $0.postReactionAdded.send($1) },
            m.route(.postReactionRemoved, SocketPostReactionUpdateEvent.self) { $0.postReactionRemoved.send($1) },
            m.route(.postTranslationUpdated, SocketPostTranslationUpdatedData.self) { $0.postTranslationUpdated.send($1) },
        ]
    }

    static func stories(_ m: SocialSocketManager) -> [SocketInboundRoute] {
        [
            // Source de vérité du nom : `STORY_TRANSLATION_UPDATED` de `packages/shared/types/socketio-events.ts`.
            m.route(.storyCreated, SocketStoryCreatedData.self) { $0.storyCreated.send($1.story) },
            m.route(.storyViewed, SocketStoryViewedData.self) { $0.storyViewed.send($1) },
            m.route(.storyReacted, SocketStoryReactedData.self) { $0.storyReacted.send($1) },
            m.route(.storyUnreacted, SocketStoryUnreactedData.self) { $0.storyUnreacted.send($1) },
            m.route(.storyUpdated, SocketStoryUpdatedData.self) { $0.storyUpdated.send($1) },
            m.route(.storyDeleted, SocketStoryDeletedData.self) { $0.storyDeleted.send($1) },
            m.route(.storyTranslationUpdated, SocketStoryTranslationUpdatedData.self) { $0.storyTranslationUpdated.send($1) },
        ]
    }

    static func statuses(_ m: SocialSocketManager) -> [SocketInboundRoute] {
        [
            m.route(.statusCreated, SocketStatusCreatedData.self) { $0.statusCreated.send($1.status) },
            m.route(.statusDeleted, SocketStatusDeletedData.self) { $0.statusDeleted.send($1.statusId) },
            m.route(.statusUpdated, SocketStatusCreatedData.self) { $0.statusUpdated.send($1.status) },
            m.route(.statusReacted, SocketStatusReactedData.self) { $0.statusReacted.send($1) },
            m.route(.statusUnreacted, SocketStatusUnreactedData.self) { $0.statusUnreacted.send($1) },
        ]
    }

    static func comments(_ m: SocialSocketManager) -> [SocketInboundRoute] {
        [
            m.route(.commentUpdated, SocketCommentUpdatedData.self) { $0.commentUpdated.send($1) },
            m.route(.commentAdded, SocketCommentAddedData.self) { $0.commentAdded.send($1) },
            m.route(.commentDeleted, SocketCommentDeletedData.self) { $0.commentDeleted.send($1) },
            m.route(.commentLiked, SocketCommentLikedData.self) { $0.commentLiked.send($1) },
            m.route(.commentUnliked, SocketCommentLikedData.self) { $0.commentUnliked.send($1) },
            m.route(.commentReactionAdded, SocketCommentReactionUpdateEvent.self) { $0.commentReactionAdded.send($1) },
            m.route(.commentReactionRemoved, SocketCommentReactionUpdateEvent.self) { $0.commentReactionRemoved.send($1) },
            m.route(.commentTranslationUpdated, SocketCommentTranslationUpdatedData.self) { $0.commentTranslationUpdated.send($1) },
            m.route(.commentMediaUpdated, SocketCommentMediaUpdatedData.self) { $0.commentMediaUpdated.send($1) },
            m.route(.mediaCaptionTranslationUpdated, SocketMediaCaptionTranslationUpdatedData.self) { $0.mediaCaptionTranslationUpdated.send($1) },
        ]
    }

    /// La passerelle émet `conversation:closed` quand une conversation est « supprimée » (soft-delete :
    /// `isActive=false` + `closedAt`) ; `conversation:deleted` reste écouté pour un futur hard-delete. Les deux
    /// alimentent `conversationDeleted`, que ses consommateurs lisent sans savoir lequel est parti.
    static func conversationLifecycle(_ m: SocialSocketManager) -> [SocketInboundRoute] {
        [
            .raw(.conversationDeleted) { [weak m] data in m?.handleConversationLifecyclePayload(data) },
            .raw(.conversationClosed) { [weak m] data in m?.handleConversationLifecyclePayload(data) },
        ]
    }
}

extension SocialSocketManager {

    func route<T: Decodable & Sendable>(
        _ event: SocketEvent,
        _ type: T.Type,
        deliver: @escaping @MainActor @Sendable (SocialSocketManager, T) -> Void
    ) -> SocketInboundRoute {
        .decoding(event, as: type, via: { [weak self] type, data, handler in
            self?.decode(type, from: data, handler: handler)
        }, deliver: { [weak self] value in
            guard let self else { return }
            deliver(self, value)
        })
    }

    func handleConversationLifecyclePayload(_ data: [Any]) {
        decode(SocketConversationDeletedData.self, from: data) { [weak self] payload in
            self?.conversationDeleted.send(payload.conversationId)
        }
    }
}
