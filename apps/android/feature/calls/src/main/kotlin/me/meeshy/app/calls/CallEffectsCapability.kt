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
import me.meeshy.sdk.model.call.VideoFilterDegradePolicy
import me.meeshy.sdk.model.call.VideoFilterDegradeState
import me.meeshy.sdk.model.call.effects.CallEffectKind
import me.meeshy.sdk.model.call.effects.CallEffectLayers
import me.meeshy.sdk.model.call.effects.CallEffectsStackRule
import me.meeshy.sdk.model.call.effects.CallEffectsCategory
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
class CallVideoEffectsController internal constructor(
    private val sink: CallVideoEffectsSink,
    private val health: CallVideoHealthImpl? = null,
) : CallFeatureController {
    @Inject
    constructor(engine: WebRtcEngine, health: CallVideoHealthImpl) : this(CallVideoEffectsSink(engine::setVideoEffects), health)

    init {
        health?.onEffectsDegradedChanged = { sink.apply(effective(_config.value)) }
    }

    private val degradePolicy = VideoFilterDegradePolicy()

    /** Les effets avancés (flou d'arrière-plan, lissage) sont coupés tant que l'appareil chauffe ; la colorimétrie reste. */
    private fun effective(requested: VideoFilterConfig): VideoFilterConfig =
        if (health?.effectsDegraded?.value == true) degradePolicy.effectiveConfig(requested, DEGRADED) else requested

    private val _config = MutableStateFlow(VideoFilterConfig.DEFAULT)
    val config: StateFlow<VideoFilterConfig> = _config.asStateFlow()

    /** L'appareil se protège : les effets avancés sont coupés (iOS `videoFilters.isAutoDegraded`, indicateur du panneau). */
    val isAutoDegraded: StateFlow<Boolean> = health?.effectsDegraded ?: MutableStateFlow(false).asStateFlow()

    private val _layers = MutableStateFlow(CallEffectLayers.EMPTY)

    /**
     * La pile de trois couches de l'appel (loi 14, #16979) : UNE pour Effets et Montage, qui la lisent et l'écrivent ;
     * elle part avec l'appel, comme les effets eux-mêmes.
     */
    val layers: StateFlow<CallEffectLayers> = _layers.asStateFlow()

    fun setLayers(layers: CallEffectLayers) {
        _layers.value = layers
    }

    /**
     * Annuler un effet de la liste (appui long sur (+)) : son réglage part de l'image envoyée et sa couche de la pile,
     * les autres gardent leur ordre. Le cadre ne vit pas ici : le Montage le retire par son propre chemin.
     */
    fun removeLayer(kind: CallEffectKind) {
        apply(CallEffectsStackRule.removing(kind, _config.value))
        _layers.value = _layers.value.removing(kind)
    }

    private var requestedCategory: CallEffectsCategory? = null

    /** Le Montage ouvre Effets sur la rangée de [category] (une puce ou (+)) ; Effets la lit une fois, à son ouverture. */
    fun requestEffectsCategory(category: CallEffectsCategory) {
        requestedCategory = category
    }

    fun takeRequestedCategory(): CallEffectsCategory? = requestedCategory.also { requestedCategory = null }

    fun apply(config: VideoFilterConfig) {
        if (_config.value == config) return
        _config.value = config
        sink.apply(effective(config))
    }

    override fun onTransition(previous: CallState, next: CallState, session: CallSessionInfo) {
        if (next is CallState.Ended || next == CallState.Idle) reset()
    }

    override fun onCleared() = reset()

    private fun reset() {
        _layers.value = CallEffectLayers.EMPTY
        requestedCategory = null
        _config.value = VideoFilterConfig.DEFAULT
        sink.apply(VideoFilterConfig.DEFAULT)
    }
}

private val DEGRADED = VideoFilterDegradeState(
    consecutiveOverBudgetFrames = VideoFilterDegradePolicy.DEFAULT_OVER_BUDGET_THRESHOLD,
    consecutiveUnderBudgetFrames = 0,
    isAutoDegraded = true,
)

/**
 * Le mode Effets est offert en vidéo établie, caméra allumée — un effet porte sur MON image, il n'a pas de sens sans
 * elle. La pilule (« Effets ») et la rangée de genres du Montage (Visage · Couleur) lisent ce même prédicat.
 */
internal fun CallUiState.offersEffectsMode(): Boolean =
    status == CallStatus.CONNECTED && isVideoCall && isCameraOn && showsConnectedLayout

/**
 * « Effets » dans la pilule : offert par [offersEffectsMode]. Allumé tant qu'un effet est choisi. Le mode s'ouvre par
 * l'écran (`CallScreenMode.Effects`), comme « Capturer l'appel ».
 */
@Singleton
class CallEffectsActionHandler @Inject constructor(
    private val effects: CallVideoEffectsController,
) : CallActionHandler {
    override fun present(state: CallUiState): CallActionPresentation? =
        if (state.offersEffectsMode()) {
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
