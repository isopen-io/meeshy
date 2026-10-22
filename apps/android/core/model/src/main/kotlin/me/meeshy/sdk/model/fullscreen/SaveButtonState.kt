package me.meeshy.sdk.model.fullscreen

import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds

/** L'état du bouton « Enregistrer » du plein écran (miroir de `_FullscreenRenderer.SaveState`). */
public enum class SaveButtonState {
    IDLE,
    SAVING,
    SAVED,
    FAILED,
    ;

    /** Le bouton ne réagit pas pendant l'enregistrement ni une fois enregistré. */
    public val isEnabled: Boolean get() = this == IDLE || this == FAILED

    /** Délai après lequel un état terminal revient à [IDLE] ; `null` si rien à régler. */
    public val settleDelay: Duration? get() = if (this == SAVED || this == FAILED) SETTLE_DELAY else null

    public fun started(): SaveButtonState = if (isEnabled) SAVING else this

    public fun finished(success: Boolean): SaveButtonState =
        if (this == SAVING) (if (success) SAVED else FAILED) else this

    public fun settled(): SaveButtonState = if (settleDelay != null) IDLE else this

    public companion object {
        public val SETTLE_DELAY: Duration = 2.seconds
    }
}
