package me.meeshy.app.calls

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.model.call.effects.CallEffectsModeState

/**
 * La session du mode « Effets de ma caméra » (iOS `CallEffectsOverlay` + `CallView+Mode`) : l'essai en cours
 * ([state]) part aussitôt sur l'image envoyée, **Quitter** rend la configuration d'origine, **Valider** garde l'effet
 * et signale le succès ([onSuccess], l'haptique). Une session ne se termine qu'une fois.
 */
internal class CallEffectsController(
    private val effects: CallVideoEffectsController,
    private val onSuccess: () -> Unit,
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

    /** Ferme la session ; rend `false` si elle l'était déjà (un double toucher ne valide pas deux fois). */
    fun finish(validated: Boolean): Boolean {
        if (finished) return false
        finished = true
        effects.apply(_state.value.exiting(validated))
        if (validated) onSuccess()
        return true
    }
}
