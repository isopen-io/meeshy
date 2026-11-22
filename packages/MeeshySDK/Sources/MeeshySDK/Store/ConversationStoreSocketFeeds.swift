import Combine

struct ConversationStoreSocketFeeds {
    let conversationUpdated: AnyPublisher<ConversationUpdatedEvent, Never>
    let conversationDeleted: AnyPublisher<ConversationDeletedSocketEvent, Never>
    let conversationRestored: AnyPublisher<ConversationRestoredSocketEvent, Never>
    let conversationObsoleted: AnyPublisher<ConversationObsoletedEvent, Never>
    let participantLeft: AnyPublisher<ParticipantLeftEvent, Never>
    let participantBanned: AnyPublisher<ParticipantBannedEvent, Never>
    let userPreferencesUpdated: AnyPublisher<UserPreferencesConversationUpdatedSocketEvent, Never>
    let userPreferencesReordered: AnyPublisher<UserPreferencesReorderedSocketEvent, Never>
    let userUpdated: AnyPublisher<UserUpdatedEvent, Never>
    let readStatusUpdated: AnyPublisher<ReadStatusUpdateEvent, Never>
    let unreadUpdated: AnyPublisher<UnreadUpdateEvent, Never>
    let categoryCreated: AnyPublisher<CategorySocketEvent, Never>
    let categoryUpdated: AnyPublisher<CategorySocketEvent, Never>
    let categoryDeleted: AnyPublisher<CategoryDeletedSocketEvent, Never>
    let categoriesReordered: AnyPublisher<CategoriesReorderedSocketEvent, Never>
    let didReconnect: AnyPublisher<Void, Never>

    /// TOUTE connexion du socket, la PREMIÈRE comprise.
    ///
    /// `didReconnect` en est un SOUS-ENSEMBLE strict
    /// (`handleConnectionEstablished` ne l'émet que `if wasReconnect`), et c'est
    /// cette différence qui a laissé deux des trois gestes de rattrapage hors
    /// du démarrage à froid (#20341). La fenêtre que le rattrapage ferme est
    /// « le socket n'écoutait pas » : le lancement de l'app en est un cas, pas
    /// une exception.
    let didConnect: AnyPublisher<Void, Never>
}
