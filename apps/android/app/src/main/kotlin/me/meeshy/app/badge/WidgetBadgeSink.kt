package me.meeshy.app.badge

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import me.meeshy.app.push.IncomingPush
import me.meeshy.app.push.PushObserver
import me.meeshy.app.startup.AppInitializer
import me.meeshy.app.widget.WidgetRefresher
import me.meeshy.sdk.notification.UnreadBadgeCoordinator
import me.meeshy.sdk.notification.UnreadBadgeSink
import me.meeshy.sdk.notification.UnreadBadgeState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

/** Repeint les widgets quand le total partage change : ils lisent le coordinateur, pas leur propre somme. */
class WidgetBadgeSink @Inject constructor(
    private val refresher: WidgetRefresher,
) : UnreadBadgeSink {
    override suspend fun publish(state: UnreadBadgeState) {
        refresher.request()
    }

    override suspend fun reset() {
        refresher.repaintAll()
    }
}

/** Demarre le coordinateur avec le processus. */
class UnreadBadgeInitializer @Inject constructor(
    private val coordinator: UnreadBadgeCoordinator,
) : AppInitializer {
    override fun initialize() {
        coordinator.start(CoroutineScope(SupervisorJob() + Dispatchers.Default))
    }
}

/** Un push qui porte le compteur de sa conversation met le total a jour, app fermee comprise. */
class UnreadPushObserver @Inject constructor(
    private val coordinator: UnreadBadgeCoordinator,
) : PushObserver {
    override fun onPush(push: IncomingPush) {
        val conversationId = push.payload.conversationId ?: return
        val unread = push.payload.conversationUnread ?: return
        coordinator.onServerUnread(conversationId, unread)
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface UnreadBadgeAppModule {
    @Binds @IntoSet fun sink(impl: WidgetBadgeSink): UnreadBadgeSink
    @Binds @IntoSet fun initializer(impl: UnreadBadgeInitializer): AppInitializer
    @Binds @IntoSet fun pushObserver(impl: UnreadPushObserver): PushObserver
}
