package me.meeshy.sdk.model.call.frames

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/** Une position d'ornement semé : son centre, son rayon et le rang du tirage qui l'a produite. */
public data class CallFrameOrnamentSpot(val x: Double, val y: Double, val r: Double, val draw: Int)

/** Tout ce qu'un ornement sait de la scène où il se pose (`OrnamentStage` du web, `CallFrameOrnamentStage` d'iOS). */
public data class CallFrameOrnamentStage(
    val width: Double,
    val height: Double,
    val unit: Double,
    val zones: List<CallFrameRect>,
    val avoid: List<CallFrameRect>,
    val top: CallFrameRect,
    val bottom: CallFrameRect,
    val inner: CallFrameRect,
    val slots: List<CallFrameSlotBox>,
    val front: Boolean,
    /** L'encombrement des textes des réserves : aucun ornement semé ne s'y pose. */
    val text: List<CallFrameRect> = emptyList(),
    /** Le titre (ou, à défaut, le sous-titre) — ce que le ruban habille. */
    val headline: CallFrameRect? = null,
)

/**
 * LES ORNEMENTS, SANS CANEVAS — le miroir de `CallFrameRenderer+Kit.swift` (zones, tirage de points) et
 * de `frame-paint-ornaments.ts`. Placement DÉTERMINISTE : la graine est le RANG de l'ornement dans le
 * cadre, jamais l'horloge, donc deux rendus de la même scène donnent le même dessin (l'aperçu ne scintille pas).
 */
public object CallFrameOrnamentGeometry {
    private const val POINT_TRIES = 6

    /** La graine d'un ornement : fonction de son seul rang dans `look.ornaments`. */
    public fun seed(rank: Int): Double = 1000.0 + rank * 131.0

    /**
     * Les zones où un ornement se pose : la toile entière (`back`), ou les marges et les réserves de
     * texte seulement (`front`, § 4.4) — un ornement de premier plan ne couvre jamais un visage.
     */
    public fun zones(bounds: CallFrameRect, areas: CallFrameAreas, front: Boolean): List<CallFrameRect> {
        if (!front) return listOf(bounds)
        val inner = areas.inner
        val margins = listOf(
            CallFrameRect(0.0, 0.0, bounds.width, inner.minY),
            CallFrameRect(0.0, inner.maxY, bounds.width, bounds.height - inner.maxY),
            CallFrameRect(0.0, inner.minY, inner.minX, inner.height),
            CallFrameRect(inner.maxX, inner.minY, bounds.width - inner.maxX, inner.height),
        )
        return (listOf(areas.top, areas.bottom) + margins).filter { it.width > 0 && it.height > 0 }
    }

    /** La scène d'un ornement, depuis les zones d'un cadre. */
    public fun stage(
        bounds: CallFrameRect,
        areas: CallFrameAreas,
        slots: List<CallFrameSlotBox>,
        front: Boolean,
        text: List<CallFrameRect> = emptyList(),
        headline: CallFrameRect? = null,
    ): CallFrameOrnamentStage = CallFrameOrnamentStage(
        width = bounds.width,
        height = bounds.height,
        unit = areas.unit,
        zones = zones(bounds, areas, front),
        avoid = slots.map { CallFrameRenderKit.footprint(it) },
        top = areas.top,
        bottom = areas.bottom,
        inner = areas.inner,
        slots = slots,
        front = front,
        text = text,
        headline = headline,
    )

    /** Un point tiré dans l'union de [zones], pondérée par leur aire. */
    public fun pointIn(zones: List<CallFrameRect>, seed: Double, draw: Int): Pair<Double, Double>? {
        val areas = zones.map { it.width * it.height }
        val total = areas.sum()
        if (total <= 0) return null
        var left = CallFrameRenderKit.rand(seed, (draw * 3).toDouble()) * total
        var index = 0
        areas.forEachIndexed { at, area ->
            if (left >= 0) {
                index = at
                left -= area
            }
        }
        val zone = zones[index]
        return Pair(
            zone.minX + CallFrameRenderKit.rand(seed, (draw * 3 + 1).toDouble()) * zone.width,
            zone.minY + CallFrameRenderKit.rand(seed, (draw * 3 + 2).toDouble()) * zone.height,
        )
    }

    /**
     * [count] positions tirées dans les zones ; chacune évite les textes des réserves et, au premier plan,
     * garde son rayon de jeu avec les cases. Une position sans place après six essais est abandonnée.
     */
    public fun spots(
        stage: CallFrameOrnamentStage,
        seed: Double,
        count: Int,
        radius: (Int) -> Double,
    ): List<CallFrameOrnamentSpot> = (0 until maxOf(0, count)).mapNotNull { draw ->
        val r = radius(draw)
        val found = (0 until POINT_TRIES).firstNotNullOfOrNull { attempt ->
            val candidate = pointIn(stage.zones, seed, draw * 7 + attempt) ?: return@firstNotNullOfOrNull null
            val around = CallFrameRect(candidate.first - r, candidate.second - r, r * 2, r * 2)
            candidate.takeIf {
                stage.text.none { overlaps(it, around) } && (!stage.front || stage.avoid.none { box -> overlaps(box, around) })
            }
        }
        found?.let { CallFrameOrnamentSpot(it.first, it.second, r, draw) }
    }

    /** `CGRect.intersects` : deux rectangles qui ne font que se toucher ne se coupent pas. */
    public fun overlaps(a: CallFrameRect, b: CallFrameRect): Boolean =
        a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY
}

/** Le mouvement d'un ornement en direct : une dérive douce en boucle, une entrée en fondu — jamais sous « Réduire les animations ». */
public object CallFrameOrnamentMotionPlan {
    public const val APPEAR_SECONDS: Double = 0.6
    private const val LOOP_PERIOD_SECONDS = 6.0

    /** Le décalage (en pixels) d'un ornement à l'instant [elapsed] ; nul s'il est immobile ou si le mouvement est réduit. */
    public fun offset(
        motion: CallFrameOrnamentMotion,
        rank: Int,
        elapsed: Double,
        unit: Double,
        reduceMotion: Boolean,
    ): Pair<Double, Double> {
        if (reduceMotion || elapsed <= 0) return Pair(0.0, 0.0)
        return when (motion) {
            CallFrameOrnamentMotion.STILL -> Pair(0.0, 0.0)
            CallFrameOrnamentMotion.LOOP -> {
                val phase = CallFrameRenderKit.rand(CallFrameOrnamentGeometry.seed(rank), 99.0) * 2 * PI
                val angle = elapsed / LOOP_PERIOD_SECONDS * 2 * PI + phase
                Pair(sin(angle) * unit * 0.006, cos(angle) * unit * 0.01)
            }
            CallFrameOrnamentMotion.ON_APPEAR -> Pair(0.0, (1 - progress(elapsed)) * unit * 0.03)
        }
    }

    /** L'opacité (0…1) : un fondu pour `onAppear`, 1 partout ailleurs et sous « Réduire les animations ». */
    public fun alpha(motion: CallFrameOrnamentMotion, elapsed: Double, reduceMotion: Boolean): Double =
        if (reduceMotion || motion != CallFrameOrnamentMotion.ON_APPEAR) 1.0 else progress(elapsed)

    /** Vrai quand le dessin change d'une image à l'autre. */
    public fun animates(motion: CallFrameOrnamentMotion, elapsed: Double, reduceMotion: Boolean): Boolean = when {
        reduceMotion || motion == CallFrameOrnamentMotion.STILL -> false
        motion == CallFrameOrnamentMotion.ON_APPEAR -> elapsed < APPEAR_SECONDS
        else -> true
    }

    private fun progress(elapsed: Double): Double = min(1.0, maxOf(0.0, elapsed / APPEAR_SECONDS))
}
