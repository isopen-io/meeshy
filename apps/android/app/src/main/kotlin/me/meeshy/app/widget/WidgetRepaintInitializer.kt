package me.meeshy.app.widget

import android.content.ComponentCallbacks
import android.content.Context
import android.content.res.Configuration
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import me.meeshy.app.startup.AppInitializer
import me.meeshy.sdk.conversation.ConversationRepository

/**
 * Repeint les widgets dès que ce qu'ils montrent change : une conversation de la fenêtre qu'ils
 * lisent (message reçu par socket ou par push, lecture, épingle, changement de compte), la langue
 * du lecteur, le mode nuit du système. Aucune lecture réseau : tout vient du cache local, comme le
 * widget lui-même. `updatePeriodMillis` n'est plus que le filet.
 */
class WidgetRepaintInitializer @Inject constructor(
    @ApplicationContext private val context: Context,
    private val conversations: ConversationRepository,
    private val refresher: WidgetRefresher,
) : AppInitializer {
    override fun initialize() {
        val nightMode = NightModeChange(context.resources.configuration.uiMode)
        context.registerComponentCallbacks(
            object : ComponentCallbacks {
                override fun onConfigurationChanged(newConfig: Configuration) {
                    if (nightMode.observe(newConfig.uiMode)) refresher.request()
                }

                @Deprecated("Sans objet : les widgets ne retiennent aucune mémoire.")
                override fun onLowMemory() = Unit
            },
        )
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            WidgetRepaintPolicy
                .triggers(conversations.recentCachedFingerprint(), refresher.requests)
                .collect { refresher.repaintAll() }
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface WidgetRepaintModule {
    @Binds
    @IntoSet
    fun widgetRepaintInitializer(impl: WidgetRepaintInitializer): AppInitializer
}
