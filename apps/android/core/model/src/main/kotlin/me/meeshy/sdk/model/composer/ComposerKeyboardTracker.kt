package me.meeshy.sdk.model.composer

/**
 * Le mouvement du clavier tel que la plateforme l'a annoncé — miroir d'iOS `KeyboardTransition`
 * (#4949). Sert à faire rejoindre à la réserve basse du fil le mouvement de la barre, sans
 * l'animer une seconde fois une fois le mouvement fini.
 *
 * [perFrame] vaut vrai quand les insets arrivent image par image (API 30+) : le fil les suit
 * alors exactement, sans animation propre.
 */
data class ComposerKeyboardTransition(
    val heightDp: Float,
    val durationMs: Long,
    val announcedAtMs: Long,
    val perFrame: Boolean,
) {
    /** Vivante tant que le mouvement annoncé dure, plus une passe de marge. */
    fun isLive(nowMs: Long): Boolean = nowMs - announcedAtMs <= durationMs + LIVE_SLACK_MS

    companion object {
        /** Durée servie quand la plateforme n'annonce pas la sienne. */
        const val FALLBACK_DURATION_MS: Long = 250L
        const val LIVE_SLACK_MS: Long = 100L

        fun announce(heightDp: Float, announcedDurationMs: Long?, nowMs: Long, perFrame: Boolean): ComposerKeyboardTransition =
            ComposerKeyboardTransition(
                heightDp = heightDp,
                durationMs = announcedDurationMs?.takeIf { it > 0L } ?: FALLBACK_DURATION_MS,
                announcedAtMs = nowMs,
                perFrame = perFrame,
            )
    }
}

/** Réducteur pur du suivi du clavier. */
object ComposerKeyboardTracker {
    /**
     * Une nouvelle hauteur d'inset annonce un nouveau mouvement ; la même hauteur ne relance rien
     * (sinon le mouvement ne finirait jamais). Une hauteur négative est ignorée.
     */
    fun onInset(
        current: ComposerKeyboardTransition?,
        heightDp: Float,
        announcedDurationMs: Long?,
        nowMs: Long,
        perFrame: Boolean,
    ): ComposerKeyboardTransition? = when {
        heightDp < 0f -> current
        current != null && current.heightDp == heightDp -> current
        else -> ComposerKeyboardTransition.announce(heightDp, announcedDurationMs, nowMs, perFrame)
    }

    /** Vrai tant que le clavier bouge. */
    fun isMoving(current: ComposerKeyboardTransition?, nowMs: Long): Boolean = current?.isLive(nowMs) == true

    /** La hauteur à mémoriser : seulement une fois le mouvement fini, et seulement un clavier levé. */
    fun settledHeight(current: ComposerKeyboardTransition?, nowMs: Long): Float? =
        current?.takeIf { !it.isLive(nowMs) && it.heightDp > 0f }?.heightDp
}
