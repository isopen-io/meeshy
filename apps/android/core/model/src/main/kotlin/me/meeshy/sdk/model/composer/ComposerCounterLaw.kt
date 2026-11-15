package me.meeshy.sdk.model.composer

/** Ce que le compteur n/max dit au verre (iOS `topToolbar`, bande de fin). */
public sealed interface ComposerCounterState {
    public data object Hidden : ComposerCounterState
    public data class Visible(val label: String, val atLimit: Boolean) : ComposerCounterState
}

/** La loi du compteur : visible au-delà de 80 % de la limite, rouge à la limite, absent sans limite. */
public object ComposerCounterLaw {
    private const val SHOW_RATIO: Double = 0.8

    public fun state(length: Int, maxLength: Int?): ComposerCounterState {
        if (maxLength == null || length <= (maxLength * SHOW_RATIO).toInt()) return ComposerCounterState.Hidden
        return ComposerCounterState.Visible("$length/$maxLength", atLimit = length >= maxLength)
    }
}
