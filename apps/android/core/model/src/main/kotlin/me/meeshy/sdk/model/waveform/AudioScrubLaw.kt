package me.meeshy.sdk.model.waveform

public enum class ScrubKind { TAP, DRAG }

public data class ScrubState(val isScrubbing: Boolean) {
    public companion object {
        public val IDLE: ScrubState = ScrubState(false)
    }
}

public sealed interface ScrubEvent {
    public data object Down : ScrubEvent
    public data object Up : ScrubEvent
    public data object Cancel : ScrubEvent
}

/**
 * Loi de scrub de l'onde — miroir de `scrubFraction` et du `DragGesture(minimumDistance: 0)` d'iOS :
 * la position se cherche dès le contact (un simple tap cherche), le signal « scrubbing en cours »
 * vit du contact à la levée ou à l'annulation, l'haptique légère n'accompagne que la levée.
 */
public object AudioScrubLaw {
    public fun fraction(x: Float, width: Float, isRtl: Boolean = false): Double {
        if (width <= 0f) return 0.0
        val f = (x.coerceIn(0f, width) / width).toDouble()
        return if (isRtl) 1.0 - f else f
    }

    public fun kind(travelPx: Float, slopPx: Float): ScrubKind =
        if (travelPx < slopPx) ScrubKind.TAP else ScrubKind.DRAG

    public fun reduce(state: ScrubState, event: ScrubEvent): ScrubState = when (event) {
        ScrubEvent.Down -> ScrubState(true)
        ScrubEvent.Up, ScrubEvent.Cancel -> ScrubState.IDLE
    }

    public fun hapticOnEnd(event: ScrubEvent): Boolean = event == ScrubEvent.Up
}
