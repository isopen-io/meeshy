package me.meeshy.app.stories

import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

/**
 * La géométrie d'un VRAI cube de côté `largeur`, centré derrière l'écran (iOS `StoryGroupCube.face`) : la face à
 * l'angle θ tourne autour de l'axe vertical du cube, et le cube entier recule exactement de ce dont son arête la plus
 * proche avancerait — l'arête commune des deux faces reste dans le plan de l'écran. Fonction PURE : le Composable ne
 * fait que lire ces valeurs en phase de dessin (`graphicsLayer`).
 *
 * Chaque face reçoit une transformation COMPLÈTE (translation, rotation, recul), calculée dans le même repère que sa
 * voisine : deux faces qui ne partagent pas le repère se chevaucheraient à mi-course.
 */
object StoryGroupCubeGeometry {
    /** Le commit atteint l'identité AVANT l'échange de contenu : la face entrante est à plat quand la vraie carte la remplace. */
    const val COMMIT_MILLIS = 340
    const val SWAP_DELAY_MILLIS = 380

    /** Opacité maximale du voile noir : atteinte quand la face est de profil. */
    const val MAXIMUM_SHADE = StoryCubeTransform.MAXIMUM_SHADE

    /**
     * Une face du cube telle que le lecteur la monte. [isFacingViewer] : une face de dos se masque — elle recouvrirait en
     * miroir le bord de la story en cours. [scale] est le recul en perspective, [translationX] la position de son centre
     * après perspective, [shade] l'opacité du voile noir d'une face qui se détourne de la lumière.
     */
    data class Face(
        val rotationYDegrees: Float,
        val translationX: Float,
        val scale: Float,
        val shade: Float,
        val isFacingViewer: Boolean,
    )

    /**
     * [offsetX] : position de la face en pixels — 0 au repos, ±[width] pour la face voisine qui attend de l'autre côté
     * de l'arête. L'angle est plafonné à [StoryCubeTransform.EDGE_DEGREES] (90° pile rend la projection singulière),
     * mais la face est de dos dès que l'angle NON plafonné atteint 90°.
     */
    fun face(offsetX: Float, width: Float): Face {
        val safeWidth = width.coerceAtLeast(1f)
        val degrees = StoryCubeTransform.faceDegrees(offsetX, safeWidth)
        val radians = Math.toRadians(degrees.toDouble())
        val half = safeWidth / 2f
        val sine = sin(radians).toFloat()
        val cosine = cos(radians).toFloat()
        val pushBack = half * (abs(cosine) + abs(sine) - 1f)
        val depth = half * cosine - half - pushBack
        val distance = 2f * half * StoryCubeTransform.CAMERA_DISTANCE_IN_WIDTHS
        val scale = 1f / (1f + abs(depth) / distance)
        return Face(
            rotationYDegrees = degrees,
            translationX = half * sine * scale,
            scale = scale,
            shade = StoryCubeTransform.shade(offsetX, safeWidth),
            isFacingViewer = abs(offsetX / safeWidth * 90f) < 90f,
        )
    }

    /** Position de la face du groupe voisin quand la face courante est à [currentOffsetX] : de l'autre côté de l'arête. */
    fun neighborOffset(currentOffsetX: Float, width: Float): Float =
        if (currentOffsetX < 0f) currentOffsetX + width else currentOffsetX - width

    /**
     * Courbe de révélation PURE de l'identité : invisible sur les tout premiers points de course (un micro-glissé ne doit
     * pas faire clignoter un visage), puis linéaire, pleine bien avant le commit — l'interlude qui suit prend le relais
     * sans saut d'opacité. [progress] : 0 au repos, 1 arête à 90°.
     */
    fun identityOpacity(progress: Float): Float =
        ((progress - IDENTITY_START) / (IDENTITY_FULL - IDENTITY_START)).coerceIn(0f, 1f)

    /** Avancement du geste pour la révélation : |décalage| / largeur, borné à [0, 1]. */
    fun revealProgress(currentOffsetX: Float, width: Float): Float = (abs(currentOffsetX) / width.coerceAtLeast(1f)).coerceIn(0f, 1f)

    private const val IDENTITY_START = 0.08f
    private const val IDENTITY_FULL = 0.55f
}
