package me.meeshy.app.calls

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoMap
import dagger.multibindings.IntoSet
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.feature.calls.R
import me.meeshy.sdk.call.WebRtcEngine
import me.meeshy.sdk.model.call.CallAction
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.VideoFilterConfig
import me.meeshy.ui.icons.MeeshyIcons
import javax.inject.Inject
import javax.inject.Singleton

/** Where the effects of my camera go: the engine's sent image. A seam, so the controller is testable. */
fun interface CallVideoEffectsSink {
    fun apply(config: VideoFilterConfig)
}

/**
 * Les effets de MA caméra pour l'appel en cours (iOS `callManager.videoFilters.config`) : ce que le mode
 * « Effets » essaie et valide, posé aussitôt sur l'image envoyée. L'état vit le temps d'un appel : il
 * revient au neutre à la fin, l'appel suivant repart sans effet.
 */
@Singleton
class CallVideoEffectsController internal constructor(private val sink: CallVideoEffectsSink) : CallFeatureController {
    @Inject
    constructor(engine: WebRtcEngine) : this(CallVideoEffectsSink(engine::setVideoEffects))

    private val _config = MutableStateFlow(VideoFilterConfig.DEFAULT)
    val config: StateFlow<VideoFilterConfig> = _config.asStateFlow()

    fun apply(config: VideoFilterConfig) {
        if (_config.value == config) return
        _config.value = config
        sink.apply(config)
    }

    override fun onTransition(previous: CallState, next: CallState, session: CallSessionInfo) {
        if (next is CallState.Ended || next == CallState.Idle) reset()
    }

    override fun onCleared() = reset()

    private fun reset() {
        _config.value = VideoFilterConfig.DEFAULT
        sink.apply(VideoFilterConfig.DEFAULT)
    }
}

/**
 * « Effets » dans la pilule : offert en vidéo établie, caméra allumée — un effet porte sur MON image, il
 * n'a pas de sens sans elle. Allumé tant qu'un effet est choisi. Le mode s'ouvre par l'écran
 * (`CallScreenMode.Effects`), comme « Capturer l'appel ».
 */
@Singleton
class CallEffectsActionHandler @Inject constructor(
    private val effects: CallVideoEffectsController,
) : CallActionHandler {
    override fun present(state: CallUiState): CallActionPresentation? =
        if (state.status == CallStatus.CONNECTED && state.isVideoCall && state.isCameraOn && state.showsConnectedLayout) {
            CallActionPresentation(MeeshyIcons.MagicWand, R.string.call_control_effects, isActive = effects.config.value.hasChosenFilters)
        } else {
            null
        }

    override fun perform() = Unit
}

@Module
@InstallIn(SingletonComponent::class)
interface CallEffectsCapabilityModule {
    @Binds
    @IntoSet
    fun bindFeatureController(impl: CallVideoEffectsController): CallFeatureController

    @Binds
    @IntoMap
    @CallActionKey(CallAction.Effects)
    fun bindActionHandler(impl: CallEffectsActionHandler): CallActionHandler
}
