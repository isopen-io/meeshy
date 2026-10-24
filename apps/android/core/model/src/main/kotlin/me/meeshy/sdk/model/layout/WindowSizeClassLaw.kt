package me.meeshy.sdk.model.layout

/** Classe de largeur de la fenetre de l'activite (seuils Material 600 / 840 dp). */
enum class WindowWidthClass {
    COMPACT,
    MEDIUM,
    EXPANDED,
    ;

    /** `true` pour Medium et Expanded — l'equivalent de la `UserInterfaceSizeClass.regular` iOS. */
    val isWide: Boolean get() = this != COMPACT
}

/** Classe de hauteur de la fenetre de l'activite (seuils Material 480 / 900 dp). */
enum class WindowHeightClass { COMPACT, MEDIUM, EXPANDED }

/** Les deux axes de la fenetre, mesures sur la FENETRE (split-screen, freeform), jamais sur l'ecran. */
data class WindowSizeClass(
    val width: WindowWidthClass,
    val height: WindowHeightClass,
)

/**
 * Seuils de classe de taille. La mesure est celle de la fenetre de l'activite : une tablette coupee
 * en deux est une fenetre Medium ou Compact, comme une scene iPad en Split View est `.compact`.
 * Une mesure negative ou inconnue (NaN) retombe sur Compact, la mise en page la plus sure.
 */
object WindowSizeClassLaw {
    const val MEDIUM_WIDTH_DP: Float = 600f
    const val EXPANDED_WIDTH_DP: Float = 840f
    const val MEDIUM_HEIGHT_DP: Float = 480f
    const val EXPANDED_HEIGHT_DP: Float = 900f

    fun widthClass(widthDp: Float): WindowWidthClass = when {
        !(widthDp >= MEDIUM_WIDTH_DP) -> WindowWidthClass.COMPACT
        widthDp < EXPANDED_WIDTH_DP -> WindowWidthClass.MEDIUM
        else -> WindowWidthClass.EXPANDED
    }

    fun heightClass(heightDp: Float): WindowHeightClass = when {
        !(heightDp >= MEDIUM_HEIGHT_DP) -> WindowHeightClass.COMPACT
        heightDp < EXPANDED_HEIGHT_DP -> WindowHeightClass.MEDIUM
        else -> WindowHeightClass.EXPANDED
    }

    fun classify(widthDp: Float, heightDp: Float): WindowSizeClass =
        WindowSizeClass(width = widthClass(widthDp), height = heightClass(heightDp))
}

/** Posture d'un appareil pliable : a plat (ou sans pli), sur table (charniere horizontale), en livre. */
enum class WindowPosture { NORMAL, TABLETOP, BOOK }

/**
 * Posture deduite du pli que la fenetre traverse. Seul un pli A MOITIE OUVERT change la mise en
 * page : charniere horizontale = sur table, verticale = livre. Sans pli connu : normale.
 */
object WindowPostureLaw {
    fun resolve(isHalfOpened: Boolean?, isHingeHorizontal: Boolean?): WindowPosture = when {
        isHalfOpened != true || isHingeHorizontal == null -> WindowPosture.NORMAL
        isHingeHorizontal -> WindowPosture.TABLETOP
        else -> WindowPosture.BOOK
    }
}
