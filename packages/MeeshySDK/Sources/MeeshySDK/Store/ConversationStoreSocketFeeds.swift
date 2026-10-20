import Combine

struct ConversationStoreSocketFeeds {
    let conversationUpdated: AnyPublisher<ConversationUpdatedEvent, Never>
    let conversationDeleted: AnyPublisher<ConversationDeletedSocketEvent, Never>
    let conversationRestored: AnyPublisher<ConversationRestoredSocketEvent, Never>
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
}
