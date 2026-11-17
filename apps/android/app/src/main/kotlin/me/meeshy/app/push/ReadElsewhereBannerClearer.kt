package me.meeshy.app.push

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.launch
import me.meeshy.app.navigation.ConversationNotificationCanceller
import me.meeshy.app.startup.AppInitializer
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.UnreadUpdateEvent
import me.meeshy.sdk.socket.MessageSocketManager

/**
 * Une conversation lue AILLEURS ne garde plus ses bannières ici : le serveur annonce « zéro non lu » (`unread:updated`,
 * un autre appareil l'a ouverte) ou la lecture est locale (« marquer comme lu » depuis la liste). Sans cela, seules
 * l'ouverture du fil sur CET appareil retirait ses bannières, et la pastille de l'icône continuait d'annoncer des
 * messages déjà lus. Le retrait est celui de l'ouverture ([ConversationNotificationCanceller]) : un seul site pour
 * l'index de l'application et le tag posé par FCM.
 *
 * Limite assumée : sans processus vivant (app tuée), seul un push `notification_revoked` à la lecture, côté passerelle,
 * peut retirer la bannière.
 */
internal class ReadElsewhereBannerClearer(
    private val unreadUpdates: Flow<UnreadUpdateEvent>,
    private val localReads: Flow<String>,
    private val canceller: ConversationNotificationCanceller,
) : AppInitializer {

    override fun initialize() {
        start(CoroutineScope(SupervisorJob() + Dispatchers.Default))
    }

    fun start(scope: CoroutineScope): Job = scope.launch {
        merge(
            unreadUpdates.filter { it.unreadCount <= 0 }.map { it.conversationId },
            localReads,
        ).collect { conversationId ->
            runCatching { canceller.cancel(conversationId) }
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal object ReadElsewhereBannerClearerModule {
    @Provides
    @IntoSet
    fun clearer(
        socket: MessageSocketManager,
        conversations: ConversationRepository,
        @ApplicationContext context: Context,
    ): AppInitializer = ReadElsewhereBannerClearer(
        unreadUpdates = socket.unreadUpdated,
        localReads = conversations.readLocally,
        canceller = ConversationNotificationCanceller(context),
    )
}
