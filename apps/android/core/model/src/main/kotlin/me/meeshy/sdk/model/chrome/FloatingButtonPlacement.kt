package me.meeshy.sdk.model.chrome

import me.meeshy.sdk.model.layout.EdgeInsetsDp
import me.meeshy.sdk.model.layout.PointDp
import me.meeshy.sdk.model.layout.RectDp
import me.meeshy.sdk.model.layout.SafeZoneLaw
import java.util.Locale
import kotlin.math.abs
import kotlin.math.hypot

/**
 * Ou un bouton flottant peut se poser — miroir de `FloatingButtonPlacement.swift`
 * (packages/MeeshySDK/Sources/MeeshyUI/Primitives, #9679).
 *
 * Le disque est TOUJOURS contre le bord gauche ou droit ; seule sa hauteur est libre.
 * Toutes les mesures sont en dp, dans le repere de la fenetre (origine en haut a gauche).
 */
public enum class FloatingButtonSide(public val code: String) {
    LEADING("L"),
    TRAILING("R"),
    ;

    public val opposite: FloatingButtonSide get() = if (this == LEADING) TRAILING else LEADING

    public companion object {
        public fun fromCode(code: String): FloatingButtonSide? = entries.firstOrNull { it.code == code }
    }
}

/**
 * La place CHOISIE : un bord, et la hauteur du centre en fraction de la hauteur de
 * l'ECRAN (0 = haut, 1 = bas). Rapportee a l'ecran et non a la plage permise : la plage
 * depend de la zone sure mesuree, qui peut changer d'une passe de mise en page a l'autre.
 */
public class FloatingButtonPlacement private constructor(
    public val side: FloatingButtonSide,
    public val screenFraction: Float,
) {
    override fun equals(other: Any?): Boolean =
        other is FloatingButtonPlacement && other.side == side && other.screenFraction == screenFraction

    override fun hashCode(): Int = 31 * side.hashCode() + screenFraction.hashCode()

    override fun toString(): String = "FloatingButtonPlacement(side=$side, screenFraction=$screenFraction)"

    /** La forme persistee : `v3,L,0.512345` (trois champs : une vieille version qui attend `x,y` retombe sur son defaut). */
    public val storageValue: String
        get() = "v3,${side.code},${String.format(Locale.ROOT, "%.6f", screenFraction)}"

    public companion object {
        public fun of(side: FloatingButtonSide, screenFraction: Float): FloatingButtonPlacement =
            FloatingButtonPlacement(side, if (screenFraction.isNaN()) 0f else screenFraction.coerceIn(0f, 1f))
    }
}

/** Ce que contient une valeur de position persistee. */
public sealed interface FloatingButtonStoredPosition {
    /** La forme actuelle (`v3`). */
    public data class Placement(val placement: FloatingButtonPlacement) : FloatingButtonStoredPosition

    /** Les premiers builds de #9679 (`v2,L,0.42`) : une fraction de la PLAGE permise. */
    public data class RangeFraction(val side: FloatingButtonSide, val fraction: Float) : FloatingButtonStoredPosition

    /**
     * L'ancien format `x,y` normalise — celui qu'ecrivait Android avant ce lot
     * (`encodePosition`) et la forme des positions par defaut.
     */
    public data class Legacy(val x: Float, val y: Float) : FloatingButtonStoredPosition

    public companion object {
        /** Ne leve jamais : une valeur illisible rend `null` (l'appelant retombe sur le defaut). */
        public fun parse(raw: String?): FloatingButtonStoredPosition? {
            val parts = raw?.split(',')?.map { it.trim() } ?: return null
            if (parts.size == 3) {
                val side = FloatingButtonSide.fromCode(parts[1]) ?: return null
                val value = parts[2].toDoubleOrNull()?.takeIf { it.isFinite() } ?: return null
                return when (parts[0]) {
                    "v3" -> Placement(FloatingButtonPlacement.of(side, value.toFloat()))
                    "v2" -> RangeFraction(side, value.toFloat().coerceIn(0f, 1f))
                    else -> null
                }
            }
            if (parts.size != 2) return null
            val x = parts[0].toDoubleOrNull()?.takeIf { it.isFinite() } ?: return null
            val y = parts[1].toDoubleOrNull()?.takeIf { it.isFinite() } ?: return null
            return Legacy(x.toFloat().coerceIn(0f, 1f), y.toFloat().coerceIn(0f, 1f))
        }
    }
}

/**
 * Les bandes que l'ancienne geometrie reservait : elles ne bornent plus rien, elles servent a
 * RELIRE une valeur `x,y` (dont les defauts) la ou l'ancienne geometrie la posait — sous
 * l'encoche majoree, l'en-tete etendu et la bande de stories. Miroir de `FloatingButtonSafeZone`.
 */
public object FloatingButtonSafeZone {
    /** La plus haute encoche du parc pris en charge. */
    public const val MAX_TOP_INSET: Float = 62f

    /** La bande de stories posee sous l'en-tete etendu, au repos. */
    public const val STORY_BAND: Float = 120f

    /** Encoche + en-tete etendu + bande de stories. */
    public const val TOP: Float = MAX_TOP_INSET + CollapsibleHeaderMetrics.EXPANDED_HEIGHT + STORY_BAND

    /** La bande du bas, barre de recherche visible. */
    public const val LEGACY_BOTTOM: Float = 110f
}

/** Les centres effectifs des deux boutons, chevauchement resolu. */
public data class FloatingButtonsLayout(val feed: PointDp, val menu: PointDp)

/**
 * La SEULE source de la geometrie des boutons flottants : le conteneur qui les pose et
 * l'echelle du menu la lisent tous deux. [safeInsets] est la zone sure REELLE (barres systeme
 * union decoupe, `SafeZoneLaw.insets`).
 */
public data class FloatingButtonGeometry(
    val screenWidth: Float,
    val screenHeight: Float,
    val safeInsets: EdgeInsetsDp,
) {
    public val isMeasured: Boolean get() = screenWidth > 0f && screenHeight > 0f

    /** La fenetre moins sa zone sure. */
    public val safeZone: RectDp get() = SafeZoneLaw.safeRect(screenWidth, screenHeight, safeInsets)

    private val half: Float get() = BUTTON_SIZE / 2f

    /** Le plus haut centre possible : juste sous la zone sure du haut. */
    public val minY: Float get() = safeZone.top + VERTICAL_MARGIN + half

    /** Le plus bas centre possible : juste au-dessus de la zone sure du bas. */
    public val maxY: Float get() = maxOf(minY, safeZone.bottom - VERTICAL_MARGIN - half)

    public fun x(side: FloatingButtonSide): Float = when (side) {
        FloatingButtonSide.LEADING -> safeInsets.left + EDGE_PADDING + half
        FloatingButtonSide.TRAILING -> screenWidth - safeInsets.right - EDGE_PADDING - half
    }

    public fun center(placement: FloatingButtonPlacement): PointDp =
        PointDp(x(placement.side), clampY(placement.screenFraction * screenHeight))

    /** La place que designe un point : le bord le plus proche, la hauteur bornee, exprimee sur l'ecran. */
    public fun placementAt(point: PointDp): FloatingButtonPlacement {
        val side = if (point.x < screenWidth / 2f) FloatingButtonSide.LEADING else FloatingButtonSide.TRAILING
        val fraction = if (screenHeight > 0f) clampY(point.y) / screenHeight else 0f
        return FloatingButtonPlacement.of(side, fraction)
    }

    /** Le centre qu'une valeur persistee designe ; une valeur illisible retombe sur [fallback]. */
    public fun centerForStorage(raw: String?, fallback: String): PointDp =
        when (val stored = FloatingButtonStoredPosition.parse(raw) ?: FloatingButtonStoredPosition.parse(fallback)) {
            is FloatingButtonStoredPosition.Placement -> center(stored.placement)
            is FloatingButtonStoredPosition.RangeFraction ->
                PointDp(x(stored.side), minY + (maxY - minY) * stored.fraction)
            is FloatingButtonStoredPosition.Legacy -> {
                val side = if (stored.x < 0.5f) FloatingButtonSide.LEADING else FloatingButtonSide.TRAILING
                PointDp(x(side), clampY(legacyCenterY(stored.y)))
            }
            null -> PointDp(x(FloatingButtonSide.LEADING), minY)
        }

    /** La hauteur que l'ancienne geometrie donnait a `y` : bandes reservees, zone sure nulle. */
    private fun legacyCenterY(y: Float): Float {
        val top = FloatingButtonSafeZone.TOP + half
        val bottom = maxOf(top, screenHeight - FloatingButtonSafeZone.LEGACY_BOTTOM - half)
        return top + (bottom - top) * y
    }

    /** Borne un centre a la plage, par la loi de zone sure (marge verticale incluse). */
    private fun clampY(y: Float): Float = SafeZoneLaw.clampCenterY(y, half + VERTICAL_MARGIN, safeZone)

    /** Le Flux garde sa place ; le Menu, s'il tombe sur lui, se decale. */
    public fun layout(feedStorage: String?, menuStorage: String?): FloatingButtonsLayout {
        val feed = centerForStorage(feedStorage, DEFAULT_FEED_STORAGE)
        val menu = centerForStorage(menuStorage, DEFAULT_MENU_STORAGE)
        return FloatingButtonsLayout(feed = feed, menu = resolved(menu, awayFrom = feed))
    }

    /** La place d'un bouton lache en [point] quand l'autre est en [other]. */
    public fun placementDroppedAt(point: PointDp, avoiding: PointDp): FloatingButtonPlacement {
        val wanted = center(placementAt(point))
        return placementAt(resolved(wanted, awayFrom = avoiding))
    }

    /** [center] decale hors de [awayFrom] s'ils sont du meme cote et trop pres. */
    public fun resolved(center: PointDp, awayFrom: PointDp): PointDp {
        val separation = MINIMUM_SEPARATION
        if (abs(center.x - awayFrom.x) >= TOLERANCE || abs(center.y - awayFrom.y) >= separation - TOLERANCE) {
            return center
        }
        val below = awayFrom.y + separation
        val above = awayFrom.y - separation
        val candidates = if (center.y >= awayFrom.y) listOf(below, above) else listOf(above, below)
        val fitting = candidates.firstOrNull { it >= minY - TOLERANCE && it <= maxY + TOLERANCE }
        if (fitting != null) return PointDp(center.x, clampY(fitting))
        val side = if (center.x < screenWidth / 2f) FloatingButtonSide.TRAILING else FloatingButtonSide.LEADING
        return PointDp(x(side), center.y)
    }

    /**
     * La valeur a persister a la FIN d'un glisser parti de [start], ou `null` : rien a ecrire.
     * Un toucher — meme tremble — n'ecrit rien. Seul producteur d'une position persistee.
     */
    public fun storageAfterDrag(start: PointDp, translationX: Float, translationY: Float, avoiding: PointDp): String? {
        if (hypot(translationX, translationY) < DRAG_THRESHOLD) return null
        val dropped = PointDp(start.x + translationX, start.y + translationY)
        return placementDroppedAt(dropped, avoiding).storageValue
    }

    /** L'echelle s'ouvre vers le bas si elle y tient, sinon vers le haut si elle y tient, sinon du cote le plus large. */
    public fun menuOpensDownward(center: PointDp, ladderExtent: Float): Boolean {
        val below = screenHeight - safeInsets.bottom - (center.y + half)
        val above = (center.y - half) - safeInsets.top
        if (below >= ladderExtent) return true
        if (above >= ladderExtent) return false
        return below >= above
    }

    public companion object {
        public const val BUTTON_SIZE: Float = 52f

        /** Ecart horizontal entre le disque et le bord de l'ecran. */
        public const val EDGE_PADDING: Float = 20f

        /** Ecart entre le disque et la zone sure, en haut comme en bas. */
        public const val VERTICAL_MARGIN: Float = 8f

        /** Ecart minimal entre deux disques poses du meme cote. */
        public const val DISC_GAP: Float = 12f

        public const val MINIMUM_SEPARATION: Float = BUTTON_SIZE + DISC_GAP

        /** Course en deca de laquelle un geste est un TOUCHER, pas un glisser. */
        public const val DRAG_THRESHOLD: Float = 12f

        /** Defauts inchanges depuis avant #9679 : Flux en haut a gauche, Menu en haut a droite, sous les stories. */
        public const val DEFAULT_FEED_STORAGE: String = "0.0,0.0"
        public const val DEFAULT_MENU_STORAGE: String = "1.0,0.0"

        private const val TOLERANCE: Float = 0.5f
    }
}
