package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable

/** Les formes d'un squelette : celles du composant attendu, jamais un texte ni une icône (K38). */
public sealed interface MeeshySkeletonShape {
    public data class Line(val widthRatio: Float) : MeeshySkeletonShape
    public data class Pill(val widthDp: Float) : MeeshySkeletonShape
    public data class Ticket(val cutDp: Float) : MeeshySkeletonShape
    public data class Circle(val diameterDp: Float) : MeeshySkeletonShape
    public data class Card(val aspect: Float, val radiusDp: Float) : MeeshySkeletonShape
}

@Immutable
public data class MeeshySkeletonSize(val widthDp: Float, val heightDp: Float, val cornerRadiusDp: Float)

/**
 * **La loi du squelette** : seulement si le cache est vide. Un cache, même périmé, se peint tout de suite ; le squelette
 * n'existe qu'au tout premier chargement et n'est jamais posé par-dessus un contenu. Miroir de `MeeshySkeletonLaw` (iOS).
 */
public object MeeshySkeletonLaw {
    public fun shows(isLoading: Boolean, hasCachedData: Boolean): Boolean = isLoading && !hasCachedData
}

/**
 * **La recette de K38 (l'atome squelette) en VALEURS** : la silhouette de chaque forme et le reflet. Une seule horloge pour
 * tout l'écran ; le reflet n'apparaît qu'après 150 ms (une réponse rapide ne clignote pas) et s'arrête sous mouvement réduit.
 */
public object MeeshySkeletonRecipe {
    public const val SHEEN_DELAY_MILLIS: Int = 150
    private const val LINE_HEIGHT_DP: Float = 14f
    private const val LINE_RADIUS_DP: Float = 6f
    private const val PILL_HEIGHT_DP: Float = 34f
    private const val TICKET_HEIGHT_DP: Float = 96f

    /** La silhouette d'une forme dans la largeur offerte ; un ratio hors bornes est ramené. */
    public fun size(shape: MeeshySkeletonShape, availableWidthDp: Float): MeeshySkeletonSize {
        val width = if (availableWidthDp.isFinite()) availableWidthDp.coerceAtLeast(0f) else 0f
        return when (shape) {
            is MeeshySkeletonShape.Line -> {
                val ratio = if (shape.widthRatio.isFinite()) shape.widthRatio.coerceIn(0f, 1f) else 1f
                MeeshySkeletonSize(width * ratio, LINE_HEIGHT_DP, LINE_RADIUS_DP)
            }
            is MeeshySkeletonShape.Pill -> MeeshySkeletonSize(shape.widthDp.coerceAtLeast(0f), PILL_HEIGHT_DP, PILL_HEIGHT_DP / 2f)
            is MeeshySkeletonShape.Ticket -> MeeshySkeletonSize(width, TICKET_HEIGHT_DP, shape.cutDp.coerceAtLeast(0f))
            is MeeshySkeletonShape.Circle -> {
                val side = shape.diameterDp.coerceAtLeast(0f)
                MeeshySkeletonSize(side, side, side / 2f)
            }
            is MeeshySkeletonShape.Card -> {
                val ratio = if (shape.aspect.isFinite() && shape.aspect > 0f) shape.aspect else 1f
                MeeshySkeletonSize(width, width / ratio, shape.radiusDp.coerceAtLeast(0f))
            }
        }
    }

    /** Le reflet balaie après le délai, jamais sous mouvement réduit : l'aplat reste fixe. */
    public fun sheenAnimates(reduceMotion: Boolean, hasWaitedDelay: Boolean): Boolean = hasWaitedDelay && !reduceMotion
}
