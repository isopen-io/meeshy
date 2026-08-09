package me.meeshy.sdk.model.chrome

/**
 * Position d'un bouton flottant, NORMALISEE dans [0,1] sur les deux axes.
 *
 * Normalisee et non en dp : la meme preference doit valoir pour un telephone, une
 * tablette et une rotation. Stocker des pixels ferait sortir le bouton de l'ecran au
 * premier changement de taille — et un bouton hors ecran, ici, c'est la navigation
 * entiere qui devient inatteignable.
 *
 * Pendant iOS : `ButtonPosition` (MeeshyUI/Primitives/FloatingButtons.swift).
 */
public data class FloatingButtonPosition(val x: Float, val y: Float) {

    public val isLeft: Boolean get() = x < 0.5f
    public val isTop: Boolean get() = y < 0.5f

    public companion object {
        public val TOP_LEFT: FloatingButtonPosition = FloatingButtonPosition(0f, 0f)
        public val TOP_RIGHT: FloatingButtonPosition = FloatingButtonPosition(1f, 0f)
        public val BOTTOM_LEFT: FloatingButtonPosition = FloatingButtonPosition(0f, 1f)
        public val BOTTOM_RIGHT: FloatingButtonPosition = FloatingButtonPosition(1f, 1f)

        /** Defauts refletant iOS : le Flux a gauche, le Menu a droite, a portee de pouce. */
        public val DEFAULT_LEFT: FloatingButtonPosition = FloatingButtonPosition(0f, 0.82f)
        public val DEFAULT_RIGHT: FloatingButtonPosition = FloatingButtonPosition(1f, 0.82f)
    }
}

/** Ramene [position] dans [0,1] sur les deux axes. */
public fun clampToBounds(position: FloatingButtonPosition): FloatingButtonPosition =
    FloatingButtonPosition(
        x = position.x.coerceIn(0f, 1f),
        y = position.y.coerceIn(0f, 1f),
    )

/**
 * Colle le bouton au bord vertical le plus proche, en gardant sa hauteur.
 *
 * Seul l'axe X est aimante : l'utilisateur choisit la HAUTEUR qui tombe sous son
 * pouce, le bord n'etant qu'un ancrage. Aimanter Y aussi renverrait le bouton dans
 * un coin a chaque relachement, et lui reprendrait le seul reglage qui compte.
 */
public fun snapToNearestEdge(position: FloatingButtonPosition): FloatingButtonPosition {
    val bounded = clampToBounds(position)
    return FloatingButtonPosition(x = if (bounded.isLeft) 0f else 1f, y = bounded.y)
}

/** Encode pour DataStore. Format : `"x,y"`. */
public fun encodePosition(position: FloatingButtonPosition): String =
    "${position.x},${position.y}"

/**
 * Decode une valeur stockee. Ne leve JAMAIS : une preference illisible degrade vers
 * [fallback]. Un bouton de navigation qui disparait sur une donnee corrompue rendrait
 * l'application impilotable — le cout d'une valeur approximative est sans commune
 * mesure avec celui d'un ecran sans commandes.
 *
 * Hors bornes est RAMENE plutot que rejete (une version anterieure a pu ecrire
 * autrement), mais NaN degrade : il traverserait le clamp et casserait le layout.
 */
public fun decodePosition(raw: String?, fallback: FloatingButtonPosition): FloatingButtonPosition {
    val parts = raw?.split(',') ?: return fallback
    if (parts.size != 2) return fallback
    val x = parts[0].toFloatOrNull() ?: return fallback
    val y = parts[1].toFloatOrNull() ?: return fallback
    if (x.isNaN() || y.isNaN()) return fallback
    return clampToBounds(FloatingButtonPosition(x, y))
}
