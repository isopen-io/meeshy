package me.meeshy.app.calls

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.model.call.effects.CallEffectsModeState

/**
 * La session du mode « Effets de ma caméra » (iOS `CallEffectsModeControls`) : chaque essai ([state]) part aussitôt
 * sur l'image envoyée et SE GARDE — ni Quitter ni Valider (loi 14), ‹ revient à l'appel avec le look. Une session
 * ne se termine qu'une fois ; passé ce point, plus rien ne bouge.
 */
internal class CallEffectsController(
    private val effects: CallVideoEffectsController,
) {
    private val _state = MutableStateFlow(CallEffectsModeState.opening(effects.config.value))
    val state: StateFlow<CallEffectsModeState> = _state.asStateFlow()

    private var finished = false

    init {
        effects.apply(_state.value.current)
    }

    fun change(transform: (CallEffectsModeState) -> CallEffectsModeState) {
        if (finished) return
        _state.update(transform)
        effects.apply(_state.value.current)
    }

    /** Ferme la session en gardant le look ; rend `false` si elle l'était déjà (un double toucher ne ferme pas deux fois). */
    fun finish(): Boolean {
        if (finished) return false
        finished = true
        return true
    }
}
