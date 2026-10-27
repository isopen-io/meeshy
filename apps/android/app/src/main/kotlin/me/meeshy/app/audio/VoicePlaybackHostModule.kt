package me.meeshy.app.audio

import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.core.content.ContextCompat
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
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import me.meeshy.app.startup.AppInitializer
import me.meeshy.app.startup.AppLocalsProvider
import me.meeshy.ui.component.audio.LocalVoicePlaybackHost
import timber.log.Timber

/** Donne le pont de la session de lecture aux écrans qui jouent des vocaux (`LocalVoicePlaybackHost`). */
internal class VoicePlaybackLocalsProvider @Inject constructor(
    private val bridge: VoicePlaybackSessionBridge,
) : AppLocalsProvider {

    @Composable
    override fun Provide(content: @Composable () -> Unit) {
        CompositionLocalProvider(LocalVoicePlaybackHost provides bridge, content = content)
    }
}

/**
 * Démarre le service de lecture au PREMIER vocal publié : l'utilisateur vient de toucher la bulle,
 * l'app est au premier plan, c'est le seul moment où Android autorise un service de premier plan.
 * Le service se rend seul quand le lecteur retire son vocal.
 */
internal class VoicePlaybackServiceStarter @Inject constructor(
    @ApplicationContext private val context: Context,
    private val bridge: VoicePlaybackSessionBridge,
) : AppInitializer {
    override fun initialize() {
        CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate).launch {
            bridge.snapshot.map { it != null }.distinctUntilChanged().collect { active ->
                if (!active) return@collect
                try {
                    ContextCompat.startForegroundService(context, Intent(context, VoicePlaybackService::class.java))
                } catch (refused: RuntimeException) {
                    Timber.w(refused, "service de lecture refusé")
                }
            }
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface VoicePlaybackHostModule {
    @Binds
    @IntoSet
    fun voicePlaybackLocalsProvider(provider: VoicePlaybackLocalsProvider): AppLocalsProvider

    @Binds
    @IntoSet
    fun voicePlaybackServiceStarter(starter: VoicePlaybackServiceStarter): AppInitializer
}
