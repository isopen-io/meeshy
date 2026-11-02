package me.meeshy.sdk.model.composer

/** Ce que devient la barre quand le doigt la lâche. */
enum class ComposerMinimizeOutcome {
    /** Retour élastique : la barre reprend sa place. */
    REBOUND,

    /** Replie le clavier ou le panneau ouvert, la barre reste dépliée. */
    DISMISS_SURFACES,

    /** Replie la barre en bouton. */
    MINIMIZE,
}

/**
 * La loi de repli de la barre de composition — miroir d'iOS `UniversalComposerBar+Layout` :
 * le glissement vers le bas suit le doigt avec une résistance de 0,5, et le lâcher replie à
 * partir de 80 dp, ou plus tôt si le geste est assez rapide.
 */
object ComposerMinimizeLaw {
    const val THRESHOLD_DP: Float = 80f
    const val RESISTANCE: Float = 0.5f
    const val VELOCITY_THRESHOLD_DP_PER_SECOND: Float = 1_200f

    /** Le décalage affiché pour un glissement de [translationDp] : vers le haut, rien ne bouge. */
    fun offsetFor(translationDp: Float): Float =
        if (translationDp > 0f) translationDp * RESISTANCE else 0f

    /**
     * Le verdict au lâcher. [canMinimize] dit si l'hôte autorise le repli en bouton ; sinon un
     * geste qui franchit la loi ferme seulement ce qui est ouvert.
     */
    fun decide(translationDp: Float, velocityDpPerSecond: Float, canMinimize: Boolean): ComposerMinimizeOutcome {
        val passes = translationDp > 0f &&
            (translationDp >= THRESHOLD_DP || velocityDpPerSecond > VELOCITY_THRESHOLD_DP_PER_SECOND)
        return when {
            !passes -> ComposerMinimizeOutcome.REBOUND
            canMinimize -> ComposerMinimizeOutcome.MINIMIZE
            else -> ComposerMinimizeOutcome.DISMISS_SURFACES
        }
    }
}
