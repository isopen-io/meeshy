package me.meeshy.sdk.model.composer.capture

/** Où en est le viseur (miroir de `ComposerSceneCameraStage` iOS). */
enum class CaptureStage { OFF, ARMED, RECORDING }

/**
 * La règle du toucher du viseur (miroir de `ComposerCaptureTapRule` iOS) : le toucher simple vise
 * TOUT DE SUITE, le second d'un double (0,3 s, même zone, après l'armement) prend la photo.
 * Le toucher qui a armé le viseur ne compte jamais comme premier d'un double.
 */
object CaptureTapRule {
    enum class Action { FOCUS, PHOTO }

    const val DOUBLE_TAP_WINDOW_MS: Long = 300
    const val HOLD_RELEASE_WINDOW_MS: Long = 300

    fun action(stage: CaptureStage, nowMs: Long, lastTapAtMs: Long?, armedAtMs: Long?): Action {
        if (stage != CaptureStage.ARMED || lastTapAtMs == null) return Action.FOCUS
        if (nowMs - lastTapAtMs > DOUBLE_TAP_WINDOW_MS) return Action.FOCUS
        if (armedAtMs != null && lastTapAtMs <= armedAtMs) return Action.FOCUS
        return Action.PHOTO
    }

    /** La levée d'une tenue n'est pas un toucher : celui qui la suit de trop près est le même doigt. */
    fun followsAHold(endedAtMs: Long?, nowMs: Long): Boolean =
        endedAtMs != null && nowMs - endedAtMs < HOLD_RELEASE_WINDOW_MS

    /** Le toucher qui ferme une alerte n'est pas un toucher sur la prise. */
    fun belongsToAnAlert(presented: Boolean, closedAtMs: Long?, nowMs: Long): Boolean =
        presented || followsAHold(closedAtMs, nowMs)
}
