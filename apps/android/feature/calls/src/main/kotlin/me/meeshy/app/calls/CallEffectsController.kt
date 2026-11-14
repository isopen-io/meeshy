package me.meeshy.app.calls

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.model.call.effects.CallEffectsModeState

/**
 * La session du mode « Effets de ma caméra » (iOS `CallEffectsModeControls`) : chaque essai ([state]) part aussitôt
 * sur l'image envoyée et SE GARDE — ni Quitter ni Valider (loi 14), ‹ revient à l'appel avec le look. La pile de trois
 * couches est celle de l'appel, que le Montage partage : la session la reprend à l'ouverture et la rend à chaque
 * changement. Une session ne se termine qu'une fois ; passé ce point, plus rien ne bouge.
 */
internal class CallEffectsController(
    private val effects: CallVideoEffectsController,
) {
    private val _state = MutableStateFlow(opening())
    val state: StateFlow<CallEffectsModeState> = _state.asStateFlow()

    private var finished = false

    init {
        publish()
    }

    fun change(transform: (CallEffectsModeState) -> CallEffectsModeState) {
        if (finished) return
        _state.update(transform)
        publish()
    }

    /**
     * #17819 — la couche du mode fond en sortant : y rentrer pendant ce fondu retrouve la même session. Close par ‹, elle se
     * rouvre comme une entrée neuve (la rangée demandée, la pile que l'appel tient) ; encore ouverte, rien ne change.
     */
    fun reopen() {
        if (!finished) return
        finished = false
        _state.value = opening()
        publish()
    }

    /** Ferme la session en gardant le look ; rend `false` si elle l'était déjà (un double toucher ne ferme pas deux fois). */
    fun finish(): Boolean {
        if (finished) return false
        finished = true
        return true
    }

    private fun opening(): CallEffectsModeState =
        CallEffectsModeState.opening(effects.config.value, effects.layers.value, effects.takeRequestedCategory())

    private fun publish() {
        effects.apply(_state.value.current)
        effects.setLayers(_state.value.layers)
    }
}
