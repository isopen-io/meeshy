package me.meeshy.sdk.model

/**
 * **La zone de commentaires d'une story suit le composeur** — miroir de `StoryCommentsZone` (iOS, #9893). Unités : dp.
 * Composeur visible, la liste monte ; clavier ouvert, elle occupe l'espace libre au-dessus du composeur ; replié en
 * bulle, elle redescend.
 */
object StoryCommentsZone {

    enum class ComposerState { ABSENT, FOLDED, EXPANDED, TYPING }

    data class Metrics(
        val windowHeight: Float,
        val safeBottom: Float,
        val topReserved: Float,
        val composerHeight: Float? = null,
        val keyboardHeight: Float = 0f,
    )

    /** [bottomInset] : bord bas de la liste depuis le bas du canvas ; [maxHeight] : sa hauteur maximale au-dessus. */
    data class Frame(val bottomInset: Float, val maxHeight: Float) {
        val topEdge: Float get() = bottomInset + maxHeight

        companion object {
            val UNPLACED = Frame(0f, 0f)
        }
    }

    const val BREATHING: Float = 20f
    const val BUBBLE_GAP: Float = 8f
    const val FALLBACK_PLATE_HEIGHT: Float = 92f
    const val FALLBACK_BUBBLE_HEIGHT: Float = 44f
    const val RESTING_FRACTION: Float = 0.42f
    const val COMPOSING_FRACTION: Float = 0.56f

    fun state(hasComposer: Boolean, isShown: Boolean, expanded: Boolean, keyboardHeight: Float): ComposerState = when {
        !hasComposer || !isShown -> ComposerState.ABSENT
        !expanded -> ComposerState.FOLDED
        keyboardHeight > 0f -> ComposerState.TYPING
        else -> ComposerState.EXPANDED
    }

    fun frame(state: ComposerState, metrics: Metrics): Frame {
        val floor = if (metrics.keyboardHeight > 0f) metrics.keyboardHeight else metrics.safeBottom + BREATHING
        val bottom: Float
        val fraction: Float?
        when (state) {
            ComposerState.ABSENT -> { bottom = metrics.safeBottom + BREATHING; fraction = RESTING_FRACTION }
            ComposerState.FOLDED -> {
                bottom = floor + (metrics.composerHeight ?: FALLBACK_BUBBLE_HEIGHT) + BUBBLE_GAP
                fraction = RESTING_FRACTION
            }
            ComposerState.EXPANDED -> {
                bottom = floor + (metrics.composerHeight ?: FALLBACK_PLATE_HEIGHT) / 2f
                fraction = COMPOSING_FRACTION
            }
            ComposerState.TYPING -> {
                bottom = floor + (metrics.composerHeight ?: FALLBACK_PLATE_HEIGHT) / 2f
                fraction = null
            }
        }
        val room = maxOf(0f, metrics.windowHeight - metrics.topReserved - bottom)
        val height = fraction?.let { minOf(it * metrics.windowHeight, room) } ?: room
        return Frame(bottomInset = bottom, maxHeight = height)
    }
}
