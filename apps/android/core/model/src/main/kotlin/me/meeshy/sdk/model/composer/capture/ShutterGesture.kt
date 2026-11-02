package me.meeshy.sdk.model.composer.capture

/**
 * Un seul déclencheur, trois intentions lues du GESTE : appuyer prend, tenir filme, glisser à droite
 * verrouille (miroir de `ComposerShutterGesture` iOS). Les seuils sont une règle, pas des `if` d'écran.
 */
object ShutterGesture {
    /** Au-delà, l'appui n'est plus une photo mais une prise vidéo. */
    const val HOLD_TO_FILM_MS: Long = 800

    /** Course vers la droite PHYSIQUE (dp) qui verrouille ; indépendante du sens d'écriture. */
    const val SLIDE_TO_LOCK_DP: Float = 64f

    enum class Outcome { PHOTO, CLOSE_TAKE, KEEP_FILMING }

    enum class Mode { VIDEO, HANDS_FREE }

    fun outcome(heldForMs: Long, locked: Boolean): Outcome = when {
        locked -> Outcome.KEEP_FILMING
        heldForMs >= HOLD_TO_FILM_MS -> Outcome.CLOSE_TAKE
        else -> Outcome.PHOTO
    }

    /** Translation x POSITIVE = vers la droite de l'écran, jamais vers la fin du texte. */
    fun locks(translationXDp: Float): Boolean = translationXDp >= SLIDE_TO_LOCK_DP

    fun lockProgress(translationXDp: Float): Float = (translationXDp / SLIDE_TO_LOCK_DP).coerceIn(0f, 1f)

    fun mode(locked: Boolean): Mode = if (locked) Mode.HANDS_FREE else Mode.VIDEO
}
