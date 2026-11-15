package me.meeshy.sdk.model.composer

/**
 * La taille des boutons ronds d'un rail du compositeur (#14499) : le [discDp] peint, la cible tactile [targetDp] qui le
 * porte, l'espace [gapDp] entre deux cibles ; [optionDiscDp] : le disque d'une option du rail d'édition (disque + mot).
 */
public data class ComposerRailSize(val discDp: Int, val optionDiscDp: Int, val gapDp: Int, val targetDp: Int = ComposerRailSizing.MIN_TARGET_DP) {
    /** D'une cible à la suivante dans la colonne. */
    public val pitchDp: Int get() = targetDp + gapDp
}

/**
 * **UNE RÈGLE DE TAILLE POUR LES RAILS** (#14499, jumelle iOS #14500) : un petit écran — [COMPACT_MAX_WIDTH_DP] de large au
 * plus, ou une hauteur utile de [COMPACT_MAX_HEIGHT_DP] au plus — réduit le disque et l'espacement de ses boutons ronds,
 * pour qu'un rail tienne davantage avant de défiler. La cible tactile, elle, ne descend jamais sous [MIN_TARGET_DP]
 * (44 pt sur iOS).
 */
public object ComposerRailSizing {
    public const val MIN_TARGET_DP: Int = 48
    public const val COMPACT_MAX_WIDTH_DP: Int = 360
    public const val COMPACT_MAX_HEIGHT_DP: Int = 640

    public val REGULAR: ComposerRailSize = ComposerRailSize(discDp = 40, optionDiscDp = 40, gapDp = 4)
    public val COMPACT: ComposerRailSize = ComposerRailSize(discDp = 36, optionDiscDp = 32, gapDp = 0)

    /** La taille d'un écran de [widthDp] sur une hauteur utile de [heightDp]. */
    public fun of(widthDp: Float, heightDp: Float): ComposerRailSize =
        if (widthDp <= COMPACT_MAX_WIDTH_DP || heightDp <= COMPACT_MAX_HEIGHT_DP) COMPACT else REGULAR
}
