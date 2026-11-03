package me.meeshy.sdk.model.composer

/**
 * Les contextes qui exigent une BANDE horizontale sous la scène (miroir de `ComposerSceneBand` iOS, #4064) : une bande se
 * justifie quand le contrôle a besoin d'un axe horizontal ou d'une comparaison latérale ; tout le reste est un rail.
 */
enum class ComposerSceneBand {
    PALETTE,

    /** Le CADRE (#8414) : Ajuster / Remplir et le fond des bandes d'un média de fond. */
    FRAME,
    ;

    companion object {
        /** Une seule porte « Fond », deux objets : le cadre dès que la scène a un média de fond. */
        fun forBackgroundDoor(hasBackgroundMedia: Boolean): ComposerSceneBand = if (hasBackgroundMedia) FRAME else PALETTE

        /** La bande réellement OUVERTE : une bande demandée mais non servie est absente, jamais une bande vide. */
        fun opened(requested: ComposerSceneBand?, served: Set<ComposerSceneBand>): ComposerSceneBand? =
            requested?.takeIf { it in served }
    }
}
