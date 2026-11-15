package me.meeshy.app.chat

import kotlinx.coroutines.flow.StateFlow
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode

/** Ce que le fil sait du mode de lecture de SA conversation : l'état résolu et les deux écritures. */
interface ThreadReadingModeSource {
    val state: StateFlow<ReadingModeUiState?>
    fun select(mode: ConversationReadingMode)
    fun resetToAuto()
}

/**
 * Le mode de lecture, tel que l'écran du fil le lit : un point d'entrée dédié, de sorte que ni le
 * `ChatViewModel` ni son état n'en portent un champ. Toute écriture (tap de cycle, menu de la puce,
 * « Automatique ») passe par la même préférence collante que le sous-menu de la liste.
 */
internal class ThreadReadingModeViewModel(private val source: ThreadReadingModeSource) {

    /** `null` tant que l'ouverture n'est pas résolue : pas de puce. */
    val state: StateFlow<ReadingModeUiState?> get() = source.state

    fun select(mode: ConversationReadingMode) = source.select(mode)

    fun resetToAuto() = source.resetToAuto()

    /** Le tap de la puce : passe à la vue suivante du cycle ; `false` quand il n'y a rien vers quoi cycler. */
    fun cycle(): Boolean {
        val next = source.state.value?.nextInCycle ?: return false
        source.select(next)
        return true
    }
}
