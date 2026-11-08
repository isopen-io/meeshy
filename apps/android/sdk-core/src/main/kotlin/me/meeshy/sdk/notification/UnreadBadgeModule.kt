package me.meeshy.sdk.notification

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import dagger.multibindings.Multibinds
import javax.inject.Singleton
import kotlinx.coroutines.flow.map
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.session.PerAccountCache
import me.meeshy.sdk.socket.MessageSocketManager

@Module
@InstallIn(SingletonComponent::class)
internal abstract class UnreadBadgeSinksModule {
    @Multibinds
    abstract fun sinks(): Set<@JvmSuppressWildcards UnreadBadgeSink>
}

@Module
@InstallIn(SingletonComponent::class)
internal object UnreadBadgeModule {
    @Provides
    @Singleton
    fun coordinator(
        conversations: ConversationRepository,
        socket: MessageSocketManager,
        notifications: NotificationRepository,
        preferences: NotificationPreferencesStore,
        active: ActiveConversationStore,
        sinks: Set<@JvmSuppressWildcards UnreadBadgeSink>,
    ): UnreadBadgeCoordinator = UnreadBadgeCoordinator(
        cacheSnapshots = conversations.unreadSnapshot(),
        serverUpdates = socket.unreadUpdated.map { it.conversationId to it.unreadCount },
        localReads = conversations.readLocally,
        bell = notifications.unreadCountStream,
        badgesEnabled = preferences.preferences.map { it.notificationBadgeEnabled },
        openConversation = active.conversationId,
        sinks = sinks,
    )

    @Provides
    @IntoSet
    fun perAccount(coordinator: UnreadBadgeCoordinator): PerAccountCache = coordinator
}
