package me.meeshy.app.widget

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import me.meeshy.app.startup.AppInitializer
import me.meeshy.sdk.engagement.EngagementProgressRepository
import me.meeshy.sdk.game.GameDevicePrefsStore
import me.meeshy.sdk.model.game.GameFlameWidgetFeed
import me.meeshy.sdk.session.SessionRepository

/**
 * Repeint « Ma Flamme » (#20566) quand ce qu'il montre change, et seulement alors (iOS : `MenuActsRingStore` ne recharge
 * le widget que si le cliché change) : le bloc `game` caché (tout écran qui relit la progression l'écrit), « Jeu masqué »
 * et le compte. Aucune lecture réseau ; la déconnexion vide le cache, donc le widget revient à l'invitation.
 */
class GameFlameWidgetRepaintInitializer @Inject constructor(
    private val engagement: EngagementProgressRepository,
    private val gamePrefs: GameDevicePrefsStore,
    private val session: SessionRepository,
    private val refresher: WidgetRefresher,
) : AppInitializer {
    override fun initialize() {
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            GameFlameWidgetFeed
                .changes(session.currentUser.map { it?.id }, gamePrefs.prefs, engagement.observeCachedGame())
                .collect { refresher.repaintGameFlame() }
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface GameFlameWidgetRepaintModule {
    @Binds
    @IntoSet
    fun gameFlameWidgetRepaintInitializer(impl: GameFlameWidgetRepaintInitializer): AppInitializer
}
