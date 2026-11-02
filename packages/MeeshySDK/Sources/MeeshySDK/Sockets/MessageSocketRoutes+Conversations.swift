import Combine
import Foundation

extension MessageSocketRoutes {

    static func conversations(_ m: MessageSocketManager) -> [SocketInboundRoute] {
        [
            userPreferencesUpdated(m),
            m.route(.conversationJoined, ConversationParticipationEvent.self) { $0.conversationJoined.send($1) },
            m.route(.conversationJoinError, ConversationJoinErrorEvent.self) { $0.conversationJoinError.send($1) },
            m.route(.conversationLeft, ConversationParticipationEvent.self) { $0.conversationLeft.send($1) },
            m.route(.participantRoleUpdated, ParticipantRoleUpdatedEvent.self) { $0.participantRoleUpdated.send($1) },
            m.route(.participantRightsUpdated, ParticipantRightsUpdatedEvent.self) { $0.participantRightsUpdated.send($1) },
            m.route(.conversationUpdated, ConversationUpdatedEvent.self) { $0.conversationUpdated.send($1) },
            m.route(.conversationParticipantJoined, ParticipantJoinedEvent.self) { $0.participantJoined.send($1) },
            m.route(.conversationParticipantLeft, ParticipantLeftEvent.self) { $0.participantSelfLeft.send($1) },
            m.route(.conversationParticipantBanned, ParticipantBannedEvent.self) { $0.participantBanned.send($1) },
            m.route(.conversationParticipantUnbanned, ParticipantUnbannedEvent.self) { $0.participantUnbanned.send($1) },
            m.route(.conversationClosed, ConversationClosedEvent.self) { $0.conversationClosed.send($1) },
            m.route(.conversationEncryptionChanged, ConversationEncryptionChangedEvent.self) { _, event in ConversationEncryptionChannel.shared.changed.send(event) },
            m.route(.userUpdated, UserUpdatedEvent.self) { $0.userUpdated.send($1) },
            m.route(.userPreferencesReordered, UserPreferencesReorderedSocketEvent.self) { $0.userPreferencesReordered.send($1) },
            m.route(.conversationDeleted, ConversationDeletedSocketEvent.self) { $0.conversationDeleted.send($1) },
            m.route(.conversationRestored, ConversationRestoredSocketEvent.self) { $0.conversationRestored.send($1) },
            m.route(.categoryCreated, CategorySocketEvent.self) { $0.categoryCreated.send($1) },
            m.route(.categoryUpdated, CategorySocketEvent.self) { $0.categoryUpdated.send($1) },
            m.route(.categoryDeleted, CategoryDeletedSocketEvent.self) { $0.categoryDeleted.send($1) },
            m.route(.categoriesReordered, CategoriesReorderedSocketEvent.self) { $0.categoriesReordered.send($1) },
            m.route(.conversationStats, ConversationStatsEvent.self) { $0.conversationStatsReceived.send($1) },
            m.route(.locationLiveStarted, LiveLocationStartedEvent.self) { $0.liveLocationStarted.send($1) },
            m.route(.locationLiveUpdated, LiveLocationUpdatedEvent.self) { $0.liveLocationUpdated.send($1) },
            m.route(.locationLiveStopped, LiveLocationStoppedEvent.self) { $0.liveLocationStopped.send($1) },
            m.route(.conversationNew, ConversationNewEvent.self) { $0.conversationNew.send($1) },
            m.route(.conversationUnreadUpdated, UnreadUpdateEvent.self) { $0.unreadUpdated.send($1) },
        ]
    }

    /// Un nom d'événement, deux portées de charge (la passerelle émet une union) :
    ///   portée conversation : { userId, conversationId, version, reset, preferences }
    ///   portée catégorie    : { userId, category }
    /// On discrimine sur `conversationId` pour que chacune atterrisse sur son éditeur — la portée conversation
    /// nourrit le chemin versionné de `ConversationStore`, la portée catégorie le chemin plat historique.
    private static func userPreferencesUpdated(_ m: MessageSocketManager) -> SocketInboundRoute {
        .raw(.userPreferencesUpdated) { [weak m] data in
            guard let m else { return }
            guard let payload = data.first as? [String: Any], payload["conversationId"] is String else {
                m.decode(UserPreferencesUpdatedEvent.self, from: data) { [weak m] in m?.userPreferencesUpdated.send($0) }
                return
            }
            m.decode(UserPreferencesConversationUpdatedSocketEvent.self, from: data) { [weak m] in
                m?.userPreferencesConversationUpdated.send($0)
            }
        }
    }
}
