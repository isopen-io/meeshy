package me.meeshy.sdk.model

/** Ce que la bande de réactions montre pour un message : pastilles, « +N », bouton d'ajout. */
public data class ReactionStripLayout(
    val visibleCount: Int,
    val overflowCount: Int,
    val showsAddButton: Boolean,
) {
    /** Le bande n'est montée que s'il y a quelque chose à y poser. */
    val isMounted: Boolean get() = visibleCount > 0 || showsAddButton

    public companion object {
        /** Pastilles visibles avant « +N » (iOS `maxVisible`). */
        public const val MAX_VISIBLE: Int = 4

        /** Hauteur de mise en page (dp) d'une pastille et de la bande. */
        public const val STRIP_HEIGHT_DP: Int = 22

        /** Diamètre visible du bouton d'ajout (dp) ; sa cible fait [HIT_DIAMETER_DP]. */
        public const val CHIP_DIAMETER_DP: Int = 24
        public const val HIT_DIAMETER_DP: Int = 40

        /** Descente de la bande sous le bord bas de la bulle (dp). */
        public const val RESTING_OFFSET_DP: Int = 18

        /** Appui long (ms) qui ouvre le détail ou le sélecteur. */
        public const val LONG_PRESS_MILLIS: Long = 400L

        public fun of(reactionCount: Int, isOutgoing: Boolean, isLastReceivedMessage: Boolean): ReactionStripLayout {
            val visible = reactionCount.coerceIn(0, MAX_VISIBLE)
            return ReactionStripLayout(
                visibleCount = visible,
                overflowCount = (reactionCount - visible).coerceAtLeast(0),
                showsAddButton = !isOutgoing && isLastReceivedMessage,
            )
        }
    }
}
