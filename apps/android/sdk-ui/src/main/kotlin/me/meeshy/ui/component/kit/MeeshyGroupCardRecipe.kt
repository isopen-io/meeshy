package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable

/** Les sept fonds : relevée, creusée (dans une feuille), verre (sur un média), lavis d'accent, danger, pointillé, aplat. */
public enum class MeeshyGroupCardSurface { Raised, Ground, Glass, Accent, Danger, Dashed, Solid }

/** Les cinq gabarits : rangées (`Group`), contenu libre, demande, aperçu riche, carte qui se touche en entier (`Action`). */
public enum class MeeshyGroupCardLayout { Group, Content, Prompt, Preview, Action }

@Immutable
public data class MeeshyGroupCardValues(
    val surface: MeeshyGroupCardSurface,
    val layout: MeeshyGroupCardLayout,
    val cornerRadius: Double,
    val bubbleCornerRadius: Double,
    val borderWidth: Double,
    val borderOpacity: Double,
    val washOpacity: Double,
    val dividerOpacity: Double,
    val dividerInset: Double,
    val hasFill: Boolean,
    val isBorderDashed: Boolean,
    val usesDarkInk: Boolean,
    val usesGlass: Boolean,
    val headerHeight: Double,
    val rowMinHeight: Double,
    val verticalPadding: Double,
    val minHeight: Double,
    val scale: Double,
    val lighten: Double,
    val contentOpacity: Double,
    val isActive: Boolean,
    val haloWidth: Double,
    val haloOpacity: Double,
)

/**
 * **La recette de K43 en valeurs** : rayon, bord, lavis, filets, marges et états. Aucun rayon ni couleur ne vit hors d'elle ; le
 * verre ne vient que de K01. `Danger` teinte fond, bord ET filets : le rouge annonce une conséquence, il ne décore pas.
 * Jumeau iOS : `MeeshyGroupCardRecipe`.
 */
public object MeeshyGroupCardRecipe {
    public const val PAGE_RADIUS: Double = 26.0
    public const val MEDIA_RADIUS: Double = 30.0
    public const val ACTION_RADIUS: Double = 24.0
    public const val BUBBLE_CORNER_RADIUS: Double = 8.0
    public const val DIVIDER_INSET: Double = 18.0
    public const val HEADER_HEIGHT: Double = 44.0
    public const val ROW_MIN_HEIGHT: Double = 60.0
    public const val NEIGHBOUR_GAP: Double = 10.0
    public const val ACTION_MIN_HEIGHT: Double = 148.0
    public const val LOCKED_OPACITY: Double = 0.42
    public const val PRESSED_SCALE: Double = 0.97
    public const val PRESSED_LIGHTEN: Double = 0.12
    public const val HALO_WIDTH: Double = 4.0
    public const val HALO_OPACITY: Double = 0.18

    @Suppress("LongParameterList")
    public fun resolve(
        surface: MeeshyGroupCardSurface = MeeshyGroupCardSurface.Raised,
        layout: MeeshyGroupCardLayout = MeeshyGroupCardLayout.Content,
        isPressable: Boolean = false,
        isPressed: Boolean = false,
        isLocked: Boolean = false,
        isFeatured: Boolean = false,
        isBubble: Boolean = false,
    ): MeeshyGroupCardValues {
        val radius = cornerRadius(surface, layout)
        val lifted = isPressable && isPressed && !isLocked
        return MeeshyGroupCardValues(
            surface = surface,
            layout = layout,
            cornerRadius = radius,
            bubbleCornerRadius = if (isBubble) BUBBLE_CORNER_RADIUS else radius,
            borderWidth = borderWidth(surface),
            borderOpacity = borderOpacity(surface),
            washOpacity = washOpacity(surface),
            dividerOpacity = if (surface == MeeshyGroupCardSurface.Danger) 0.24 else 1.0,
            dividerInset = DIVIDER_INSET,
            hasFill = surface != MeeshyGroupCardSurface.Dashed,
            isBorderDashed = surface == MeeshyGroupCardSurface.Dashed,
            usesDarkInk = surface == MeeshyGroupCardSurface.Solid,
            usesGlass = surface == MeeshyGroupCardSurface.Glass,
            headerHeight = HEADER_HEIGHT,
            rowMinHeight = ROW_MIN_HEIGHT,
            verticalPadding = if (layout == MeeshyGroupCardLayout.Group) 6.0 else 0.0,
            minHeight = if (layout == MeeshyGroupCardLayout.Action) ACTION_MIN_HEIGHT else 0.0,
            scale = if (lifted) PRESSED_SCALE else 1.0,
            lighten = if (lifted) PRESSED_LIGHTEN else 0.0,
            contentOpacity = if (isLocked) LOCKED_OPACITY else 1.0,
            isActive = !isLocked,
            haloWidth = if (isFeatured) HALO_WIDTH else 0.0,
            haloOpacity = if (isFeatured) HALO_OPACITY else 0.0,
        )
    }

    /** N enfants rendent N − 1 filets ; zéro ou un enfant n'en rend aucun. */
    public fun dividerCount(children: Int): Int = maxOf(children - 1, 0)

    /** L'en-tête n'existe que s'il porte un sur-titre ou un accessoire : sinon, aucune marge. */
    public fun showsHeader(hasOverline: Boolean, hasAccessory: Boolean): Boolean = hasOverline || hasAccessory

    private fun cornerRadius(surface: MeeshyGroupCardSurface, layout: MeeshyGroupCardLayout): Double = when {
        surface == MeeshyGroupCardSurface.Glass -> MEDIA_RADIUS
        layout == MeeshyGroupCardLayout.Action -> ACTION_RADIUS
        else -> PAGE_RADIUS
    }

    private fun borderWidth(surface: MeeshyGroupCardSurface): Double = when (surface) {
        MeeshyGroupCardSurface.Dashed -> 1.5
        MeeshyGroupCardSurface.Solid -> 0.0
        else -> 1.0
    }

    private fun borderOpacity(surface: MeeshyGroupCardSurface): Double = when (surface) {
        MeeshyGroupCardSurface.Accent -> 0.30
        MeeshyGroupCardSurface.Danger -> 0.34
        else -> 1.0
    }

    private fun washOpacity(surface: MeeshyGroupCardSurface): Double = when (surface) {
        MeeshyGroupCardSurface.Accent -> 0.22
        MeeshyGroupCardSurface.Danger -> 0.08
        else -> 0.0
    }
}
