package me.meeshy.app.ongoing

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import me.meeshy.app.R
import me.meeshy.app.startup.AppInitializer
import me.meeshy.app.startup.AppLocalsProvider
import me.meeshy.sdk.model.ongoing.OutboxActivityLaw
import me.meeshy.sdk.model.ongoing.VoiceRecordingActivityLaw
import me.meeshy.sdk.network.NetworkMonitor
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.ui.component.recording.LocalVoiceRecordingHost
import javax.inject.Inject
import javax.inject.Singleton

/** L'app est-elle au premier plan ? Lu depuis le cycle de vie du processus, état initial compris. */
@Singleton
internal class ProcessForegroundState @Inject constructor() {
    private val state = MutableStateFlow(false)
    val isForeground: StateFlow<Boolean> = state.asStateFlow()

    fun onVisibilityChanged(visible: Boolean) {
        state.value = visible
    }

    fun install() {
        val lifecycle = ProcessLifecycleOwner.get().lifecycle
        state.value = lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)
        lifecycle.addObserver(
            object : DefaultLifecycleObserver {
                override fun onStart(owner: LifecycleOwner) = onVisibilityChanged(true)

                override fun onStop(owner: LifecycleOwner) = onVisibilityChanged(false)
            },
        )
    }
}

/** Démarre les deux notifications « en cours » au lancement du processus. */
internal class OngoingActivityInitializer @Inject constructor(
    @ApplicationContext private val context: Context,
    private val outbox: OutboxRepository,
    private val network: NetworkMonitor,
    private val foreground: ProcessForegroundState,
    private val outboxNotifications: OutboxOngoingNotifications,
    private val recordingBridge: VoiceRecordingActivityBridge,
    private val recordingNotifications: VoiceRecordingOngoingNotifications,
) : AppInitializer {

    override fun initialize() {
        foreground.install()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
        OutboxOngoingController(
            items = outbox.observeActivityItems(),
            isOffline = network.isOnline.map { !it },
            isForeground = foreground.isForeground,
            sink = outboxNotifications,
            wording = ::outboxWording,
        ).start(scope)
        VoiceRecordingOngoingController(
            startedAt = recordingBridge.startedAt,
            sink = recordingNotifications,
            wording = { VoiceRecordingActivityLaw.Wording(context.getString(R.string.voice_recording_activity_title)) },
        ).start(scope)
    }

    private fun outboxWording() = OutboxActivityLaw.Wording(
        story = context.getString(R.string.outbox_activity_story),
        media = context.getString(R.string.outbox_activity_media),
        messageWithMedia = context.getString(R.string.outbox_activity_message_with_media),
        sent = context.getString(R.string.outbox_activity_sent),
        failed = context.getString(R.string.outbox_activity_failed),
    )
}

/** Donne le pont de l'enregistrement aux écrans qui ouvrent le micro (`LocalVoiceRecordingHost`). */
internal class VoiceRecordingLocalsProvider @Inject constructor(
    private val bridge: VoiceRecordingActivityBridge,
) : AppLocalsProvider {

    @Composable
    override fun Provide(content: @Composable () -> Unit) {
        CompositionLocalProvider(LocalVoiceRecordingHost provides bridge, content = content)
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface OngoingActivityModule {
    @Binds
    @IntoSet
    fun ongoingActivityInitializer(initializer: OngoingActivityInitializer): AppInitializer

    @Binds
    fun recordingServiceLauncher(launcher: AndroidRecordingServiceLauncher): RecordingServiceLauncher

    @Binds
    @IntoSet
    fun voiceRecordingLocalsProvider(provider: VoiceRecordingLocalsProvider): AppLocalsProvider
}
