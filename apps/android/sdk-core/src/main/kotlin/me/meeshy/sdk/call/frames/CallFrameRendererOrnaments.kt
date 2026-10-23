package me.meeshy.sdk.call.frames

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.Shader
import me.meeshy.sdk.call.frames.CallFrameOrnamentPieces.fill
import me.meeshy.sdk.call.frames.CallFrameOrnamentPieces.glowDisc
import me.meeshy.sdk.call.frames.CallFrameOrnamentPieces.stroke
import me.meeshy.sdk.call.frames.CallFrameRendererKit.argb
import me.meeshy.sdk.call.frames.CallFrameRendererKit.fillPaint
import me.meeshy.sdk.call.frames.CallFrameRendererKit.withShadow
import me.meeshy.sdk.model.call.frames.CallFrameColor
import me.meeshy.sdk.model.call.frames.CallFrameDensity
import me.meeshy.sdk.model.call.frames.CallFrameLayer
import me.meeshy.sdk.model.call.frames.CallFrameOrnament
import me.meeshy.sdk.model.call.frames.CallFrameOrnamentGeometry
import me.meeshy.sdk.model.call.frames.CallFrameOrnamentKind
import me.meeshy.sdk.model.call.frames.CallFrameOrnamentMotionPlan
import me.meeshy.sdk.model.call.frames.CallFrameOrnamentSpot
import me.meeshy.sdk.model.call.frames.CallFrameOrnamentStage
import me.meeshy.sdk.model.call.frames.CallFrameRect
import me.meeshy.sdk.model.call.frames.CallFrameRenderKit
import me.meeshy.sdk.model.call.frames.CallFrameRenderKit.count
import me.meeshy.sdk.model.call.frames.CallFrameRenderKit.mix
import me.meeshy.sdk.model.call.frames.CallFrameRenderKit.rand
import me.meeshy.sdk.model.call.frames.CallFrameRenderKit.tint
import me.meeshy.sdk.model.call.frames.CallFrameShapeGeometry
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

private fun Double.f(): Float = toFloat()

/** Ce que l'ornement en cours sait de lui-même : sa couleur, sa graine, sa scène — et comment il sème. */
private class OrnamentCtx(val canvas: Canvas, val ornament: CallFrameOrnament, val scene: CallFrameOrnamentStage, val seed: Double) {
    val u get() = scene.unit
    val w get() = scene.width
    val h get() = scene.height
    val hex get() = ornament.color
    val ink: CallFrameColor = CallFrameRenderKit.color(ornament.color)

    fun between(draw: Int, low: Double, high: Double): Double = u * (low + rand(seed + 5, draw.toDouble()) * (high - low))

    fun scattered(base: Double, size: (Int) -> Double, body: (CallFrameOrnamentSpot) -> Unit) =
        CallFrameOrnamentGeometry.spots(scene, seed, count(base, ornament.density), size).forEach(body)

    fun scatteredBetween(base: Double, low: Double, high: Double, body: (CallFrameOrnamentSpot) -> Unit) =
        scattered(base, { between(it, low, high) }, body)

    fun unitRand(offset: Int, draw: Int): Double = rand(seed + offset, draw.toDouble())
}

/**
 * Les trente-quatre ornements (§ 4.4) — le port de `frame-paint-ornaments.ts` et de
 * `CallFrameRenderer+Ornaments.swift`. Placement DÉTERMINISTE (graine = rang de l'ornement dans le cadre) :
 * l'aperçu ne scintille pas. Un ornement `back` dispose de toute la toile ; un ornement `front` ne se pose
 * que dans les marges et les réserves de texte, sauf ceux qui HABILLENT une case sans toucher au visage
 * (couronne, rubans adhésifs).
 */
internal object CallFrameRendererOrnaments {

    /**
     * Peint les ornements de [layer] du cadre. [elapsed] (secondes) fait vivre les ornements `loop` et
     * `onAppear` ; sous [reduceMotion], ou sans durée, le dessin est le même qu'à l'arrêt.
     */
    fun paintAll(
        canvas: Canvas,
        stage: CallFrameStage,
        layer: CallFrameLayer,
        text: List<CallFrameRect> = emptyList(),
        headline: CallFrameRect? = null,
        elapsed: Double = 0.0,
        reduceMotion: Boolean = false,
    ) {
        val scene = CallFrameOrnamentGeometry.stage(stage.bounds, stage.areas, stage.boxes, layer == CallFrameLayer.FRONT, text, headline)
        stage.look.ornaments.forEachIndexed { rank, ornament ->
            if (ornament.layer != layer) return@forEachIndexed
            val (dx, dy) = CallFrameOrnamentMotionPlan.offset(ornament.motion, rank, elapsed, scene.unit, reduceMotion)
            val alpha = CallFrameOrnamentMotionPlan.alpha(ornament.motion, elapsed, reduceMotion)
            val saved = if (alpha < 1.0) canvas.saveLayerAlpha(null, (alpha * 255).toInt().coerceIn(0, 255)) else canvas.save()
            canvas.translate(dx.f(), dy.f())
            paint(canvas, ornament, scene, rank)
            canvas.restoreToCount(saved)
        }
    }

    fun paint(canvas: Canvas, ornament: CallFrameOrnament, scene: CallFrameOrnamentStage, rank: Int) {
        val ctx = OrnamentCtx(canvas, ornament, scene, CallFrameOrnamentGeometry.seed(rank))
        val dressing = ornament.kind == CallFrameOrnamentKind.CROWN || ornament.kind == CallFrameOrnamentKind.TAPE
        canvas.save()
        if (!dressing && scene.front) canvas.clipPath(Path().apply { scene.zones.forEach { rect(it.minX, it.minY, it.width, it.height) } })
        dispatch(ctx)
        canvas.restore()
    }

    private fun dispatch(c: OrnamentCtx) {
        when (c.ornament.kind) {
            CallFrameOrnamentKind.SPARKLES -> sparkles(c)
            CallFrameOrnamentKind.BOKEH -> bokeh(c)
            CallFrameOrnamentKind.CONFETTI -> confetti(c)
            CallFrameOrnamentKind.BALLOONS -> c.scatteredBetween(4.0, 0.035, 0.055) { CallFrameOrnamentPieces.balloon(c.canvas, it, c.hex, c.u) }
            CallFrameOrnamentKind.STARS -> stars(c)
            CallFrameOrnamentKind.HEARTS -> hearts(c)
            CallFrameOrnamentKind.FIREFLIES -> fireflies(c)
            CallFrameOrnamentKind.PETALS -> c.scatteredBetween(16.0, 0.01, 0.02) {
                CallFrameOrnamentPieces.petal(c.canvas, it, c.hex, c.unitRand(9, it.draw) * 2 * PI)
            }
            CallFrameOrnamentKind.LEAVES -> c.scatteredBetween(12.0, 0.014, 0.026) {
                CallFrameOrnamentPieces.leaf(c.canvas, it, c.hex, c.unitRand(9, it.draw) * 2 * PI, c.unitRand(10, it.draw) * 0.25)
            }
            CallFrameOrnamentKind.BUBBLES -> bubbles(c)
            CallFrameOrnamentKind.SNOW -> snow(c)
            CallFrameOrnamentKind.RAYS ->
                CallFrameOrnamentPieces.rays(c.canvas, c.hex, c.ornament.density, c.seed, c.w, c.h, c.u)
            CallFrameOrnamentKind.GLITCH -> glitch(c)
            CallFrameOrnamentKind.SCANLINES -> scanlines(c)
            CallFrameOrnamentKind.GRAIN -> grain(c)
            CallFrameOrnamentKind.VIGNETTE -> vignette(c)
            CallFrameOrnamentKind.LIGHTLEAK -> lightLeak(c)
            CallFrameOrnamentKind.CROWN -> CallFrameOrnamentPieces.crown(c.canvas, c.scene, c.hex)
            CallFrameOrnamentKind.RIBBON -> CallFrameOrnamentPieces.ribbon(c.canvas, c.scene, c.hex)
            CallFrameOrnamentKind.TAPE -> CallFrameOrnamentPieces.tape(c.canvas, c.scene, c.hex, c.seed)
            CallFrameOrnamentKind.REC -> CallFrameOrnamentPieces.rec(c.canvas, c.scene, c.ink)
            CallFrameOrnamentKind.CROSSHAIR -> crosshair(c)
            CallFrameOrnamentKind.ORBITS -> orbits(c)
            CallFrameOrnamentKind.RUNES -> runes(c)
            CallFrameOrnamentKind.COBWEBS ->
                CallFrameOrnamentPieces.cobwebs(c.canvas, c.w, c.h, c.u, c.ornament.density, c.ink)
            CallFrameOrnamentKind.DRIPS ->
                CallFrameOrnamentPieces.drips(c.canvas, c.w, c.u, c.ornament.density, c.seed, c.ink)
            CallFrameOrnamentKind.LIGHTNING -> lightning(c)
            CallFrameOrnamentKind.NOTES -> c.scatteredBetween(8.0, 0.018, 0.03) {
                CallFrameOrnamentPieces.note(c.canvas, it.x, it.y + it.r * 0.5, it.r, it.draw % 3 == 0, c.ink)
            }
            CallFrameOrnamentKind.CANDLES ->
                CallFrameOrnamentPieces.candles(c.canvas, c.scene, c.hex, c.ornament.density, c.seed)
            CallFrameOrnamentKind.MOON -> moon(c)
            CallFrameOrnamentKind.CLOUDS -> clouds(c)
            CallFrameOrnamentKind.BATS -> c.scatteredBetween(6.0, 0.022, 0.04) {
                fill(c.canvas, Path().apply { CallFrameOrnamentPieces.bat(this, it.x, it.y, it.r) }, c.ink)
            }
            CallFrameOrnamentKind.SKULLS -> c.scatteredBetween(3.0, 0.028, 0.042) {
                fill(c.canvas, Path().apply { CallFrameOrnamentPieces.skull(this, it.x, it.y, it.r) }, c.ink, evenOdd = true)
            }
            CallFrameOrnamentKind.ROSES -> c.scatteredBetween(4.0, 0.022, 0.036) {
                CallFrameOrnamentPieces.rose(c.canvas, it.x, it.y, it.r, c.hex)
            }
        }
    }

    private fun sparkles(c: OrnamentCtx) = c.scatteredBetween(14.0, 0.012, 0.034) { spot ->
        glowDisc(c.canvas, spot.x, spot.y, spot.r * 1.5, c.ink, 0.35)
        fill(c.canvas, Path().apply { CallFrameOrnamentPieces.sparkle(this, spot.x, spot.y, spot.r) }, c.ink)
    }

    private fun bokeh(c: OrnamentCtx) = c.scatteredBetween(9.0, 0.04, 0.12) { spot ->
        val shader = RadialGradient(
            spot.x.f(), spot.y.f(), spot.r.f(),
            intArrayOf(argb(tint(c.hex, 0.7)), argb(tint(c.hex, 0.45)), argb(tint(c.hex, 0.0))),
            floatArrayOf(0f, 0.75f, 1f), Shader.TileMode.CLAMP,
        )
        c.canvas.drawCircle(spot.x.f(), spot.y.f(), spot.r.f(), Paint(Paint.ANTI_ALIAS_FLAG).apply { this.shader = shader })
    }

    private fun confetti(c: OrnamentCtx) = c.scatteredBetween(34.0, 0.006, 0.011) { spot ->
        val turn = c.unitRand(7, spot.draw) * 2 * PI
        val piece = Path().apply {
            if (spot.draw % 3 == 0) oval(-spot.r * 0.7, -spot.r * 0.7, spot.r * 1.4, spot.r * 1.4)
            else rect(-spot.r, -spot.r * 0.45, spot.r * 2, spot.r * 0.9)
        }
        fill(c.canvas, piece.placed(spot.x, spot.y, turn), mix(c.hex, "#FFFFFF", c.unitRand(8, spot.draw) * 0.45))
    }

    private fun stars(c: OrnamentCtx) = c.scatteredBetween(16.0, 0.008, 0.022) { spot ->
        fill(c.canvas, Path().apply { CallFrameOrnamentPieces.star5(this, spot.x, spot.y, spot.r, c.unitRand(9, spot.draw) * 0.6) }, c.ink)
    }

    private fun hearts(c: OrnamentCtx) = c.scatteredBetween(12.0, 0.012, 0.026) { spot ->
        val box = CallFrameRect(-spot.r, -spot.r * 0.9, spot.r * 2, spot.r * 1.85)
        val heart = CallFrameRendererKit.toPath(CallFrameShapeGeometry.heartPath(box))
        val turn = (c.unitRand(9, spot.draw) - 0.5) * 0.7
        fill(c.canvas, heart.placed(spot.x, spot.y, turn), c.ink, alphaScale = 0.65 + c.unitRand(10, spot.draw) * 0.35)
    }

    private fun fireflies(c: OrnamentCtx) = c.scatteredBetween(22.0, 0.003, 0.006) { spot ->
        glowDisc(c.canvas, spot.x, spot.y, spot.r * 6, c.ink, 0.5)
        c.canvas.drawCircle(spot.x.f(), spot.y.f(), spot.r.f(), fillPaint(mix(c.hex, "#FFFFFF", 0.6)))
    }

    private fun bubbles(c: OrnamentCtx) = c.scatteredBetween(12.0, 0.01, 0.03) { spot ->
        val ring = Path().apply { circle(spot.x, spot.y, spot.r) }
        fill(c.canvas, ring, tint(c.hex, 0.12))
        stroke(c.canvas, ring, c.ink, max(0.6, spot.r * 0.08))
        val shine = Path().apply { canvasArc(spot.x, spot.y, spot.r * 0.68, PI * 1.1, PI * 1.45) }
        stroke(c.canvas, shine, CallFrameColor(1.0, 1.0, 1.0, 0.75), max(0.6, spot.r * 0.08))
    }

    private fun snow(c: OrnamentCtx) = c.scattered(48.0, { if (it % 7 == 0) c.between(it, 0.01, 0.016) else c.between(it, 0.002, 0.007) }) { spot ->
        val alpha = 0.55 + c.unitRand(9, spot.draw) * 0.45
        if (spot.draw % 7 != 0) {
            fill(c.canvas, Path().apply { circle(spot.x, spot.y, spot.r) }, c.ink, alphaScale = alpha)
            return@scattered
        }
        val arms = Path()
        (0 until 6).map { it * PI / 3 }.forEach { angle ->
            arms.move(spot.x, spot.y)
            arms.line(spot.x + cos(angle) * spot.r, spot.y + sin(angle) * spot.r)
            arms.move(spot.x + cos(angle) * spot.r * 0.55, spot.y + sin(angle) * spot.r * 0.55)
            arms.line(spot.x + cos(angle + 0.5) * spot.r * 0.8, spot.y + sin(angle + 0.5) * spot.r * 0.8)
        }
        stroke(c.canvas, arms, c.ink, max(0.6, spot.r * 0.12), alphaScale = alpha)
    }

    private fun glitch(c: OrnamentCtx) = (0 until count(10.0, c.ornament.density)).forEach { index ->
        val draw = index.toDouble()
        val y = rand(c.seed, draw) * c.h
        val x = rand(c.seed + 1, draw) * c.w * 0.8
        val width = c.u * (0.08 + rand(c.seed + 2, draw) * 0.4)
        val height = c.u * (0.003 + rand(c.seed + 3, draw) * 0.014)
        c.canvas.drawRect(x.f(), y.f(), (x + width).f(), (y + height).f(), fillPaint(tint(c.hex, 0.7)))
        val fringe = if (index % 2 == 0) CallFrameColor(0.0, 1.0, 240 / 255.0, 0.35) else CallFrameColor(1.0, 0.0, 170 / 255.0, 0.35)
        val fx = x + c.u * 0.012
        c.canvas.drawRect(fx.f(), (y + height).f(), (fx + width * 0.6).f(), (y + height + height * 0.6).f(), fillPaint(fringe))
    }

    /**
     * Skia lâche un rectangle anticrénelé de moins d'un pixel de haut là où CoreGraphics le couvre
     * en partie : sur une vignette, les lignes d'iOS (0,7 px) disparaissaient. Une ligne plus fine
     * qu'un pixel se peint donc sur un pixel, son opacité réduite d'autant — la même encre déposée.
     */
    private fun scanlines(c: OrnamentCtx) {
        val step = max(2.0, c.u * 0.006)
        val thickness = step * 0.35
        val painted = max(1.0, thickness)
        val lines = Path()
        (0 until kotlin.math.ceil(c.h / step).toInt()).forEach { lines.rect(0.0, it * step, c.w, painted) }
        fill(c.canvas, lines, c.ink, alphaScale = thickness / painted)
    }

    private fun grain(c: OrnamentCtx) {
        val dot = max(0.6, c.u * 0.002)
        val grains = Path()
        (0 until count(1400.0, c.ornament.density)).forEach {
            grains.rect(rand(c.seed, it.toDouble()) * c.w, rand(c.seed + 1, it.toDouble()) * c.h, dot, dot)
        }
        fill(c.canvas, grains, c.ink)
    }

    private fun vignette(c: OrnamentCtx) {
        val reach = hypot(c.w, c.h) / 2
        val strength = when (c.ornament.density) { CallFrameDensity.HIGH -> 1.0; CallFrameDensity.MID -> 0.8; CallFrameDensity.LOW -> 0.55 }
        val shader = RadialGradient(
            (c.w / 2).f(), (c.h / 2).f(), reach.f(),
            intArrayOf(argb(tint(c.hex, 0.0)), argb(tint(c.hex, 0.0)), argb(tint(c.hex, strength))),
            floatArrayOf(0f, 0.42f, 1f), Shader.TileMode.CLAMP,
        )
        c.canvas.drawPaint(Paint(Paint.ANTI_ALIAS_FLAG).apply { this.shader = shader })
    }

    private fun lightLeak(c: OrnamentCtx) {
        glowDisc(c.canvas, 0.0, 0.0, c.u * 0.95, c.ink, 0.75, screen = true)
        glowDisc(c.canvas, c.w, c.h * 0.62, c.u * 0.6, mix(c.hex, "#FFFFFF", 0.3), 0.45, screen = true)
        if (c.ornament.density != CallFrameDensity.LOW) glowDisc(c.canvas, c.w * 0.2, c.h, c.u * 0.5, c.ink, 0.35, screen = true)
    }

    private fun crosshair(c: OrnamentCtx) = c.scatteredBetween(4.0, 0.018, 0.03) { spot ->
        val (x, y, r) = Triple(spot.x, spot.y, spot.r)
        val sight = Path().apply {
            circle(x, y, r * 0.6)
            move(x - r, y); line(x - r * 0.25, y)
            move(x + r * 0.25, y); line(x + r, y)
            move(x, y - r); line(x, y - r * 0.25)
            move(x, y + r * 0.25); line(x, y + r)
        }
        stroke(c.canvas, sight, c.ink, max(0.75, c.u * 0.002))
    }

    private fun orbits(c: OrnamentCtx) = (0 until count(3.0, c.ornament.density)).forEach { index ->
        val rx = c.u * (0.42 + index * 0.16)
        val ry = rx * 0.32
        val turn = -0.35 + index * 0.55
        val ring = Path().apply { oval(-rx, -ry, rx * 2, ry * 2) }.placed(c.w / 2, c.h / 2, turn)
        stroke(c.canvas, ring, c.ink, max(0.6, c.u * 0.0022), alphaScale = 0.7)
        val at = rand(c.seed, index.toDouble()) * 2 * PI
        val moon = Path().apply { oval(cos(at) * rx - c.u * 0.009, sin(at) * ry - c.u * 0.009, c.u * 0.018, c.u * 0.018) }
        fill(c.canvas, moon.placed(c.w / 2, c.h / 2, turn), c.ink)
    }

    private fun runes(c: OrnamentCtx) = c.scatteredBetween(10.0, 0.012, 0.022) { spot ->
        val glyphs = CallFrameOrnamentPieces.runes
        val glyph = glyphs[min(glyphs.size - 1, (c.unitRand(9, spot.draw) * glyphs.size).toInt())]
        val (x, y, r) = Triple(spot.x, spot.y, spot.r)
        val strokes = Path()
        glyph.forEach { s ->
            strokes.move(x - r * 0.6 + s[0] * r * 1.2, y - r + s[1] * r * 2)
            strokes.line(x - r * 0.6 + s[2] * r * 1.2, y - r + s[3] * r * 2)
        }
        val paint = CallFrameRendererKit.strokePaint(c.ink, max(0.75, r * 0.14)).withShadow(r * 0.6, c.ink)
        c.canvas.drawPath(strokes, paint)
    }

    private fun lightning(c: OrnamentCtx) = c.scatteredBetween(3.0, 0.04, 0.07) { spot ->
        val (x, y, r) = Triple(spot.x, spot.y, spot.r)
        val bolt = Path()
        (0 until 6).forEach { index ->
            val side = if (index % 2 == 0) -1.0 else 1.0
            val swing = 0.5 + rand(c.seed + 9, (spot.draw * 6 + index).toDouble())
            val px = x + side * r * 0.25 * swing
            val py = y - r + index * r * 2 / 5
            if (index == 0) bolt.move(px, py) else bolt.line(px, py)
        }
        c.canvas.drawPath(bolt, CallFrameRendererKit.strokePaint(c.ink, max(1.0, r * 0.09)).withShadow(r * 0.35, c.ink))
        stroke(c.canvas, bolt, CallFrameColor(1.0, 1.0, 1.0, 0.9), max(0.5, r * 0.035))
    }

    private fun moon(c: OrnamentCtx) {
        val inner = c.scene.inner
        val candidates = listOf(1.0, 0.75).flatMap { scale ->
            val radius = c.u * 0.055 * scale
            listOf(inner.maxX - radius * 1.6, inner.minX + radius * 1.6).map { Triple(it, inner.minY + radius * 1.5, radius) }
        }
        val (x, y, r) = candidates.firstOrNull { (sx, sy, sr) ->
            val box = CallFrameRect(sx - sr * 1.1, sy - sr * 1.1, sr * 2.2, sr * 2.2)
            c.scene.text.none { CallFrameOrnamentGeometry.overlaps(it, box) }
        } ?: return
        glowDisc(c.canvas, x, y, r * 2.6, c.ink, 0.35)
        val crescent = Path().apply {
            circle(x, y, r)
            circle(x - r * 0.42, y - r * 0.22, r * 0.86)
        }
        fill(c.canvas, crescent, c.ink, evenOdd = true)
    }

    private fun clouds(c: OrnamentCtx) = c.scatteredBetween(4.0, 0.04, 0.07) { spot ->
        val lobes = listOf(Triple(-0.55, 0.12, 0.42), Triple(-0.12, -0.12, 0.55), Triple(0.4, 0.02, 0.45), Triple(0.05, 0.2, 0.4))
        val puff = Path().apply { lobes.forEach { circle(spot.x + it.first * spot.r, spot.y + it.second * spot.r, it.third * spot.r) } }
        val paint = fillPaint(c.ink).withShadow(spot.r * 0.3, CallFrameColor(0.0, 0.0, 0.0, 0.08), dy = spot.r * 0.08)
        c.canvas.drawPath(puff, paint)
    }
}
