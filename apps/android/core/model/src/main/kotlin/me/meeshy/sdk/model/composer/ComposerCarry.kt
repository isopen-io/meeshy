package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.StoryVisibility

/** Ce que la bascule dépose chez la surface d'arrivée, une fois ([token]) : médias, descriptions, audience. */
data class ComposerCarry(
    val target: Side,
    val plan: MediaTransferPlan,
    val audience: StoryVisibility?,
    val token: Int,
    /** Le registre d'avant cette bascule : rétabli si l'on revient avant que l'arrivée l'ait reçue. */
    val ledgerBefore: Set<String> = emptySet(),
) {
    /** Les deux porteurs du document : la feuille de post/réel, la scène de story. Le mood ne porte que du texte. */
    enum class Side {
        POST,
        SCENE,
        ;

        companion object {
            fun of(format: ComposerFormat): Side? = when (format) {
                ComposerFormat.POST, ComposerFormat.REEL -> POST
                ComposerFormat.STORY -> SCENE
                ComposerFormat.STATUS -> null
            }
        }
    }
}
