package me.meeshy.app.stories.composer.timeline

import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import me.meeshy.sdk.model.composer.timeline.TimelineEditor

/** Les effets ponctuels de la timeline : l'écran les rend (haptique) sans les rejouer à la recomposition. */
sealed interface TimelineEffect {
    /** L'aimant vient d'accrocher le bord glissé : haptique légère, une fois par accroche. */
    data object SnapEngaged : TimelineEffect
}

/**
 * Le porteur d'état de la timeline (miroir de `TimelineViewModel`) : toute la règle vit dans [TimelineEditor],
 * valeur immuable ; ce type n'en garde que le `StateFlow` et les effets. Il n'est instancié que par
 * [TimelineSession] quand la timeline s'ouvre, jamais avec le composer. Appelé depuis le fil principal.
 */
class TimelineViewModel internal constructor(initial: TimelineEditor) {

    private val mutableEditor = MutableStateFlow(initial)
    val editor: StateFlow<TimelineEditor> = mutableEditor.asStateFlow()

    private val effectChannel = Channel<TimelineEffect>(Channel.BUFFERED)
    val effects: Flow<TimelineEffect> = effectChannel.receiveAsFlow()

    /** Applique un geste du [TimelineEditor] ; l'accroche de l'aimant émet l'haptique. */
    fun edit(change: TimelineEditor.() -> TimelineEditor) {
        val before = mutableEditor.value
        val after = before.change()
        mutableEditor.value = after
        if (after.snapPulse != before.snapPulse) effectChannel.trySend(TimelineEffect.SnapEngaged)
    }

    fun select(clipId: String?) = edit { select(clipId) }

    fun inspect(clipId: String) = edit { inspect(clipId) }

    fun consumeDurationNotice() = edit { consumeDurationNotice() }

    internal fun replace(next: TimelineEditor) {
        mutableEditor.value = next
    }

    internal fun shutdown() {
        effectChannel.close()
    }
}
