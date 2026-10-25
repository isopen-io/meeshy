package me.meeshy.sdk.model.chrome

/**
 * Geometrie PURE du menu deploye par le bouton flottant droit.
 *
 * Le menu suit deux regles, toutes deux derivees de la position du bouton et non
 * d'un cote fixe — un bouton deplacable rend chaque hypothese de bord fausse un
 * jour ou l'autre :
 *  - il se deploie du cote ou il reste de la place (haut/bas) ;
 *  - il s'etend vers l'interieur de l'ecran (jamais au-dela du bord d'ancrage).
 *
 * Unites : [FloatingButtonPosition] est normalisee, le reste est en pixels — la
 * conversion appartient a l'appelant Compose, la REGLE vit ici ou elle se teste
 * en JVM pur.
 */

/** Vers le haut si le bouton est dans la moitie basse : c'est la qu'est la place. */
public fun menuUnfoldsUpward(anchor: FloatingButtonPosition): Boolean = !anchor.isTop

/** Les items s'etendent vers l'interieur : bouton a gauche -> le menu pousse a droite. */
public fun menuGrowsRightward(anchor: FloatingButtonPosition): Boolean = anchor.isLeft

/** Rectangle de l'ancre (le bouton flottant), en pixels fenetre. */
public data class MenuAnchorBounds(
    val left: Int,
    val top: Int,
    val right: Int,
    val bottom: Int,
) {
    public val centerX: Int get() = (left + right) / 2
    public val centerY: Int get() = (top + bottom) / 2
}

/** Position finale du menu, en pixels fenetre. */
public data class MenuPopupOffset(val xPx: Int, val yPx: Int)

/**
 * Place le menu contre son ancre puis le RAMENE entierement dans la fenetre.
 *
 * Alignement : sur le bord de l'ancre cote ecran (ancre a droite -> bords droits
 * alignes), au-dessus ou en dessous selon la moitie d'ecran de l'ancre. Le clamp
 * final prime sur tout le reste : un menu partiellement hors viewport est un menu
 * dont des destinations de navigation n'existent plus.
 */
public fun menuPopupOffset(
    anchor: MenuAnchorBounds,
    menuWidthPx: Int,
    menuHeightPx: Int,
    windowWidthPx: Int,
    windowHeightPx: Int,
    spacingPx: Int,
): MenuPopupOffset {
    val anchoredLeft = anchor.centerX < windowWidthPx / 2
    val x = if (anchoredLeft) anchor.left else anchor.right - menuWidthPx

    val unfoldsUpward = anchor.centerY >= windowHeightPx / 2
    val y = if (unfoldsUpward) anchor.top - spacingPx - menuHeightPx else anchor.bottom + spacingPx

    return MenuPopupOffset(
        xPx = x.coerceIn(0, maxOf(0, windowWidthPx - menuWidthPx)),
        yPx = y.coerceIn(0, maxOf(0, windowHeightPx - menuHeightPx)),
    )
}

/**
 * L'echelle VERTICALE du bouton avatar — miroir de `RootFloatingChrome.menuLadder` et du
 * modificateur `menuAnimation` iOS : des disques de [ITEM_SIZE] empiles a l'aplomb du bouton,
 * vers le bas ou vers le haut selon [FloatingButtonGeometry.menuOpensDownward], qui apparaissent
 * en echelon (0,04 s par entree) a l'echelle 0,3 -> 1, en fondu, rotation -30 deg -> 0, sur un
 * ressort 0,4 / 0,65 (fermeture 0,25, sans echelon).
 */
public object FloatingMenuLadder {
    public const val ITEM_SIZE: Float = 46f

    /** `MeeshySpacing.md`. */
    public const val ITEM_SPACING: Float = 12f
    public const val STAGGER_MILLIS: Long = 40L
    public const val OPEN_SPRING_RESPONSE: Float = 0.4f
    public const val CLOSE_SPRING_RESPONSE: Float = 0.25f
    public const val SPRING_DAMPING: Float = 0.65f
    public const val HIDDEN_SCALE: Float = 0.3f
    public const val HIDDEN_ROTATION: Float = -30f

    /** La hauteur que l'echelle occupe, pour choisir son sens d'ouverture. */
    public fun extent(count: Int): Float = count.coerceAtLeast(0) * (ITEM_SIZE + ITEM_SPACING)

    /** Le centre vertical de l'entree [index] ; l'entree 0 est la plus proche du bouton. */
    public fun itemCenterY(index: Int, menuCenterY: Float, opensDownward: Boolean): Float {
        val gap = FloatingButtonGeometry.BUTTON_SIZE / 2f + ITEM_SPACING + ITEM_SIZE / 2f
        val step = index * (ITEM_SIZE + ITEM_SPACING)
        return if (opensDownward) menuCenterY + gap + step else menuCenterY - gap - step
    }

    /** L'echelon : a l'ouverture seulement, la fermeture repart d'un bloc. */
    public fun delayMillis(index: Int, opening: Boolean): Long = if (opening) index * STAGGER_MILLIS else 0L

    /** L'aspect d'une entree a l'avancement [progress] (0 cachee, 1 posee ; le ressort peut depasser 1). */
    public data class ItemFrame(val scale: Float, val alpha: Float, val rotationDegrees: Float)

    /** Reduire les animations : ni echelle ni rotation, un simple fondu. */
    public fun frame(progress: Float, reduceMotion: Boolean): ItemFrame {
        val alpha = progress.coerceIn(0f, 1f)
        if (reduceMotion) return ItemFrame(scale = 1f, alpha = alpha, rotationDegrees = 0f)
        return ItemFrame(
            scale = HIDDEN_SCALE + (1f - HIDDEN_SCALE) * progress,
            alpha = alpha,
            // HIDDEN - HIDDEN x p, et non HIDDEN x (1 - p) : a p = 1 ce dernier rend -0.0, qu'une
            // egalite de Float (data class) distingue de 0.0 — l'echelon pose doit valoir 0 tout court.
            rotationDegrees = HIDDEN_ROTATION - HIDDEN_ROTATION * progress,
        )
    }
}
