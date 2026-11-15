package me.meeshy.sdk.call.frames

import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import me.meeshy.sdk.call.frames.CallFrameRendererKit.argb
import me.meeshy.sdk.call.frames.CallFrameRendererKit.fillPaint
import me.meeshy.sdk.call.frames.CallFrameRendererKit.strokePaint
import me.meeshy.sdk.call.frames.CallFrameRendererKit.withShadow
import me.meeshy.sdk.model.call.frames.CallFrameColor
import me.meeshy.sdk.model.call.frames.CallFrameDensity
import me.meeshy.sdk.model.call.frames.CallFrameOrnamentSpot
import me.meeshy.sdk.model.call.frames.CallFrameOrnamentStage
import me.meeshy.sdk.model.call.frames.CallFrameRect
import me.meeshy.sdk.model.call.frames.CallFrameRenderKit
import me.meeshy.sdk.model.call.frames.CallFrameRenderKit.count
import me.meeshy.sdk.model.call.frames.CallFrameRenderKit.mix
import me.meeshy.sdk.model.call.frames.CallFrameRenderKit.rand
import me.meeshy.sdk.model.call.frames.CallFrameRenderKit.tint
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

private fun Double.f(): Float = toFloat()

private val WHITE = CallFrameColor(1.0, 1.0, 1.0, 1.0)
private val BLACK = CallFrameColor(0.0, 0.0, 0.0, 1.0)

internal fun Path.circle(x: Double, y: Double, r: Double) {
    if (r > 0) addCircle(x.f(), y.f(), r.f(), Path.Direction.CW)
}

internal fun Path.rect(x: Double, y: Double, w: Double, h: Double) {
    addRect(x.f(), y.f(), (x + w).f(), (y + h).f(), Path.Direction.CW)
}

internal fun Path.oval(x: Double, y: Double, w: Double, h: Double) {
    addOval(RectF(x.f(), y.f(), (x + w).f(), (y + h).f()), Path.Direction.CW)
}

internal fun Path.move(x: Double, y: Double) = moveTo(x.f(), y.f())
internal fun Path.line(x: Double, y: Double) = lineTo(x.f(), y.f())
internal fun Path.quad(cx: Double, cy: Double, x: Double, y: Double) = quadTo(cx.f(), cy.f(), x.f(), y.f())
internal fun Path.cubic(c1x: Double, c1y: Double, c2x: Double, c2y: Double, x: Double, y: Double) =
    cubicTo(c1x.f(), c1y.f(), c2x.f(), c2y.f(), x.f(), y.f())

/** `arc` du canevas : angles en radians comptés de +x vers +y ; [anticlockwise] = angles décroissants. */
internal fun Path.canvasArc(x: Double, y: Double, radius: Double, start: Double, end: Double, anticlockwise: Boolean = false) {
    val r = max(0.0, radius)
    val raw = if (anticlockwise) -(((start - end) % (2 * PI) + 2 * PI) % (2 * PI)) else ((end - start) % (2 * PI) + 2 * PI) % (2 * PI)
    arcTo(RectF((x - r).f(), (y - r).f(), (x + r).f(), (y + r).f()), Math.toDegrees(start).f(), Math.toDegrees(raw).f(), false)
}

internal fun polygon(vararg points: Pair<Double, Double>): Path = Path().apply {
    val first = points.firstOrNull() ?: return@apply
    move(first.first, first.second)
    points.drop(1).forEach { line(it.first, it.second) }
    close()
}

/** Pose [path] dans le repère « translation puis rotation » d'une pièce (`translationX…rotated(by:)` de CoreGraphics). */
internal fun Path.placed(x: Double, y: Double, angle: Double): Path = Path(this).apply {
    transform(Matrix().apply { setTranslate(x.f(), y.f()); preRotate(Math.toDegrees(angle).f()) })
}

internal fun mixColors(from: CallFrameColor, to: CallFrameColor, share: Double): CallFrameColor {
    fun at(a: Double, b: Double) = a + (b - a) * share
    return CallFrameColor(at(from.red, to.red), at(from.green, to.green), at(from.blue, to.blue), at(from.alpha, to.alpha))
}

internal object CallFrameOrnamentPieces {

    fun fill(canvas: Canvas, path: Path, ink: CallFrameColor, alphaScale: Double = 1.0, evenOdd: Boolean = false) {
        val p = Path(path).apply { fillType = if (evenOdd) Path.FillType.EVEN_ODD else Path.FillType.WINDING }
        canvas.drawPath(p, fillPaint(ink, alphaScale))
    }

    fun stroke(canvas: Canvas, path: Path, ink: CallFrameColor, width: Double, alphaScale: Double = 1.0) {
        canvas.drawPath(path, strokePaint(ink, width, alphaScale))
    }

    /** Un disque lumineux : [ink] à [core] au centre, s'éteignant vers le bord ; [screen] pour la lumière qui s'ajoute. */
    fun glowDisc(canvas: Canvas, x: Double, y: Double, r: Double, ink: CallFrameColor, core: Double, screen: Boolean = false) {
        if (r <= 0) return
        fun stop(share: Double) = argb(ink.copy(alpha = ink.alpha * share))
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = RadialGradient(
                x.f(), y.f(), r.f(), intArrayOf(stop(core), stop(core * 0.45), stop(0.0)),
                floatArrayOf(0f, 0.45f, 1f), Shader.TileMode.CLAMP,
            )
            if (screen) xfermode = PorterDuffXfermode(PorterDuff.Mode.SCREEN)
        }
        canvas.drawCircle(x.f(), y.f(), r.f(), paint)
    }

    /** Remplit la zone de découpe courante d'un dégradé linéaire, prolongé au-delà de ses extrémités. */
    fun linear(canvas: Canvas, colors: List<CallFrameColor>, x0: Double, y0: Double, x1: Double, y1: Double) {
        val shader = CallFrameRendererKit.linearShader(colors, x0, y0, x1, y1) ?: return
        canvas.drawPaint(Paint().apply { this.shader = shader })
    }

    fun star5(path: Path, x: Double, y: Double, r: Double, turn: Double = 0.0) {
        val points = (0 until 10).map { index ->
            val angle = -PI / 2 + turn + index * PI / 5
            val radius = if (index % 2 == 0) r else r * 0.45
            Pair(x + cos(angle) * radius, y + sin(angle) * radius)
        }
        path.addPath(polygon(*points.toTypedArray()))
    }

    fun sparkle(path: Path, x: Double, y: Double, r: Double) {
        path.move(x, y - r)
        path.quad(x + r * 0.12, y - r * 0.12, x + r, y)
        path.quad(x + r * 0.12, y + r * 0.12, x, y + r)
        path.quad(x - r * 0.12, y + r * 0.12, x - r, y)
        path.quad(x - r * 0.12, y - r * 0.12, x, y - r)
        path.close()
    }

    /** Les glyphes des runes : des traits dans un carré unité (x, y de 0 à 1). */
    val runes: List<List<List<Double>>> = listOf(
        listOf(listOf(0.5, 0.0, 0.5, 1.0), listOf(0.5, 0.15, 0.85, 0.4), listOf(0.5, 0.4, 0.85, 0.65)),
        listOf(listOf(0.3, 0.0, 0.3, 1.0), listOf(0.3, 0.2, 0.75, 0.5), listOf(0.75, 0.5, 0.3, 0.8)),
        listOf(listOf(0.5, 0.0, 0.5, 1.0), listOf(0.2, 0.3, 0.8, 0.7), listOf(0.8, 0.3, 0.2, 0.7)),
        listOf(listOf(0.25, 0.0, 0.25, 1.0), listOf(0.75, 0.0, 0.75, 1.0), listOf(0.25, 0.25, 0.75, 0.6)),
        listOf(listOf(0.5, 0.0, 0.2, 0.5), listOf(0.2, 0.5, 0.5, 1.0), listOf(0.5, 0.0, 0.8, 0.5), listOf(0.8, 0.5, 0.5, 1.0)),
        listOf(listOf(0.3, 0.0, 0.3, 1.0), listOf(0.3, 0.1, 0.8, 0.35), listOf(0.3, 0.55, 0.8, 0.35)),
        listOf(listOf(0.5, 0.0, 0.5, 1.0), listOf(0.15, 0.2, 0.5, 0.5), listOf(0.85, 0.2, 0.5, 0.5)),
        listOf(listOf(0.2, 1.0, 0.5, 0.0), listOf(0.5, 0.0, 0.8, 1.0), listOf(0.35, 0.55, 0.65, 0.55)),
    )

    fun note(canvas: Canvas, x: Double, y: Double, s: Double, double: Boolean, ink: CallFrameColor) {
        fun head(hx: Double, hy: Double) {
            val ellipse = Path().apply { oval(-s * 0.32, -s * 0.22, s * 0.64, s * 0.44) }
            fill(canvas, ellipse.placed(hx, hy, -0.35), ink)
        }
        head(x, y)
        val stem = Path().apply {
            move(x + s * 0.28, y - s * 0.05)
            line(x + s * 0.28, y - s * 1.1)
        }
        if (double) {
            head(x + s * 0.75, y - s * 0.15)
            stem.move(x + s * 1.03, y - s * 0.2)
            stem.line(x + s * 1.03, y - s * 1.25)
            stroke(canvas, stem, ink, s * 0.08)
            fill(
                canvas,
                polygon(
                    Pair(x + s * 0.24, y - s * 1.1), Pair(x + s * 1.07, y - s * 1.25),
                    Pair(x + s * 1.07, y - s * 1.05), Pair(x + s * 0.24, y - s * 0.9),
                ),
                ink,
            )
            return
        }
        stroke(canvas, stem, ink, s * 0.08)
        val flag = Path().apply {
            move(x + s * 0.28, y - s * 1.1)
            cubic(x + s * 0.4, y - s * 0.75, x + s * 0.85, y - s * 0.75, x + s * 0.7, y - s * 0.35)
        }
        stroke(canvas, flag, ink, s * 0.08)
    }

    fun bat(path: Path, x: Double, y: Double, s: Double) {
        fun mx(dx: Double) = x + s * dx
        fun my(dy: Double) = y + s * dy
        path.move(mx(0.0), my(-0.12))
        path.line(mx(-0.08), my(-0.3))
        path.line(mx(-0.1), my(-0.12))
        path.quad(mx(-0.45), my(-0.4), mx(-1.0), my(-0.15))
        path.quad(mx(-0.8), my(-0.05), mx(-0.72), my(0.12))
        path.quad(mx(-0.6), my(0.02), mx(-0.45), my(0.15))
        path.quad(mx(-0.3), my(0.05), mx(-0.16), my(0.22))
        path.quad(mx(0.0), my(0.1), mx(0.16), my(0.22))
        path.quad(mx(0.3), my(0.05), mx(0.45), my(0.15))
        path.quad(mx(0.6), my(0.02), mx(0.72), my(0.12))
        path.quad(mx(0.8), my(-0.05), mx(1.0), my(-0.15))
        path.quad(mx(0.45), my(-0.4), mx(0.1), my(-0.12))
        path.line(mx(0.08), my(-0.3))
        path.close()
    }

    fun skull(path: Path, x: Double, y: Double, s: Double) {
        fun mx(dx: Double) = x + s * dx
        fun my(dy: Double) = y + s * dy
        path.move(mx(-0.5), my(0.05))
        path.cubic(mx(-0.62), my(-0.75), mx(0.62), my(-0.75), mx(0.5), my(0.05))
        path.quad(mx(0.45), my(0.28), mx(0.3), my(0.32))
        path.line(mx(0.3), my(0.55))
        path.quad(mx(0.0), my(0.66), mx(-0.3), my(0.55))
        path.line(mx(-0.3), my(0.32))
        path.quad(mx(-0.45), my(0.28), mx(-0.5), my(0.05))
        path.close()
        path.oval(x - s * 0.34, y - s * 0.13, s * 0.26, s * 0.3)
        path.oval(x + s * 0.08, y - s * 0.13, s * 0.26, s * 0.3)
        path.addPath(polygon(Pair(mx(0.0), my(0.18)), Pair(mx(0.07), my(0.3)), Pair(mx(-0.07), my(0.3))))
        listOf(-0.15, 0.0, 0.15).forEach { dx -> path.rect(x + s * dx - s * 0.02, y + s * 0.4, s * 0.04, s * 0.14) }
    }

    fun rose(canvas: Canvas, x: Double, y: Double, s: Double, hex: String) {
        listOf(-0.6, 0.6).forEach { side ->
            val leaf = Path().apply {
                move(x + side * s * 0.5, y + s * 0.3)
                quad(x + side * s * 1.15, y + s * 0.05, x + side * s * 1.35, y + s * 0.55)
                quad(x + side * s * 0.9, y + s * 0.75, x + side * s * 0.5, y + s * 0.3)
            }
            fill(canvas, leaf, CallFrameRenderKit.color("#3F6B45"))
        }
        canvas.save()
        canvas.clipPath(Path().apply { circle(x, y, s * 0.72) })
        val shade = RadialGradient(
            (x - s * 0.2).f(), (y - s * 0.25).f(), (s * 1.3).f(),
            intArrayOf(argb(mix(hex, "#FFFFFF", 0.25)), argb(mix(hex, "#000000", 0.25))),
            floatArrayOf(0f, 1f), Shader.TileMode.CLAMP,
        )
        canvas.drawPaint(Paint(Paint.ANTI_ALIAS_FLAG).apply { shader = shade })
        canvas.restore()
        val spiral = Path()
        (0 until 40).forEach { index ->
            val angle = index * 0.42
            val radius = s * 0.04 + index * s * 0.0155
            val px = x + cos(angle) * radius
            val py = y + sin(angle) * radius * 0.92
            if (index == 0) spiral.move(px, py) else spiral.line(px, py)
        }
        stroke(canvas, spiral, mix(hex, "#000000", 0.45), max(0.6, s * 0.07))
    }

    fun balloon(canvas: Canvas, spot: CallFrameOrnamentSpot, hex: String, unit: Double) {
        val x = spot.x
        val y = spot.y
        val r = spot.r
        val body = mixColors(CallFrameRenderKit.color(hex), if (spot.draw % 2 == 0) WHITE else BLACK, 0.12)
        val string = Path().apply {
            move(x, y + r * 1.2)
            cubic(x - r * 0.5, y + r * 1.9, x + r * 0.5, y + r * 2.4, x - r * 0.1, y + r * 3.1)
        }
        stroke(canvas, string, tint(hex, 0.55), max(0.6, unit * 0.0018))
        canvas.save()
        canvas.clipPath(Path().apply { oval(x - r, y - r * 1.2, r * 2, r * 2.4) })
        val shade = RadialGradient(
            (x - r * 0.35).f(), (y - r * 0.45).f(), (r * 1.7).f(),
            intArrayOf(argb(mixColors(body, WHITE, 0.55)), argb(body), argb(mixColors(body, BLACK, 0.3))),
            floatArrayOf(0.06f, 0.4f, 1f), Shader.TileMode.CLAMP,
        )
        canvas.drawPaint(Paint(Paint.ANTI_ALIAS_FLAG).apply { shader = shade })
        canvas.restore()
        fill(canvas, polygon(Pair(x, y + r * 1.15), Pair(x - r * 0.14, y + r * 1.34), Pair(x + r * 0.14, y + r * 1.34)), mixColors(body, BLACK, 0.25))
    }

    fun petal(canvas: Canvas, spot: CallFrameOrnamentSpot, hex: String, turn: Double) {
        val r = spot.r
        val shape = Path().apply {
            move(0.0, -r)
            cubic(r * 0.9, -r * 0.6, r * 0.7, r * 0.8, 0.0, r)
            cubic(-r * 0.7, r * 0.8, -r * 0.9, -r * 0.6, 0.0, -r)
        }
        canvas.save()
        canvas.translate(spot.x.f(), spot.y.f())
        canvas.rotate(Math.toDegrees(turn).f())
        canvas.clipPath(shape)
        linear(canvas, listOf(mix(hex, "#FFFFFF", 0.4), CallFrameRenderKit.color(hex)), 0.0, -r, 0.0, r)
        canvas.restore()
    }

    fun leaf(canvas: Canvas, spot: CallFrameOrnamentSpot, hex: String, turn: Double, shade: Double) {
        val r = spot.r
        canvas.save()
        canvas.translate(spot.x.f(), spot.y.f())
        canvas.rotate(Math.toDegrees(turn).f())
        val blade = Path().apply {
            move(-r, 0.0)
            quad(0.0, -r * 0.8, r, 0.0)
            quad(0.0, r * 0.8, -r, 0.0)
        }
        fill(canvas, blade, mix(hex, "#000000", shade))
        val vein = Path().apply {
            move(-r * 0.9, 0.0)
            line(r * 0.85, 0.0)
        }
        stroke(canvas, vein, mix(hex, "#FFFFFF", 0.35), max(0.5, r * 0.06))
        canvas.restore()
    }

    fun rays(canvas: Canvas, hex: String, density: CallFrameDensity, seed: Double, width: Double, height: Double, unit: Double) {
        val ox = width * 0.5
        val oy = -unit * 0.1
        val reach = hypot(width, height)
        val total = count(7.0, density)
        (0 until total).forEach { index ->
            val centred = index - (total - 1) / 2.0
            val fan = centred * (1.4 / total)
            val jitter = (rand(seed, index.toDouble()) - 0.5) * 0.08
            val angle = PI / 2 + fan + jitter
            val spread = 0.035 + rand(seed + 1, index.toDouble()) * 0.05
            val beam = polygon(
                Pair(ox, oy),
                Pair(ox + cos(angle - spread) * reach, oy + sin(angle - spread) * reach),
                Pair(ox + cos(angle + spread) * reach, oy + sin(angle + spread) * reach),
            )
            canvas.save()
            canvas.clipPath(beam)
            linear(canvas, listOf(tint(hex, 0.55), tint(hex, 0.0)), ox, oy, ox + cos(angle) * reach, oy + sin(angle) * reach)
            canvas.restore()
        }
    }

    fun crown(canvas: Canvas, scene: CallFrameOrnamentStage, hex: String) {
        val hero = scene.slots.firstOrNull()?.rect ?: return
        val u = scene.unit
        val width = min(hero.width * 0.34, u * 0.16)
        val above = scene.slots.drop(1).map { it.rect }.filter { it.maxY <= hero.minY && it.minX < hero.maxX && hero.minX < it.maxX }
        val ceiling = (listOf(scene.inner.minY) + above.map { it.maxY }).max()
        val room = hero.minY - ceiling
        val height = min(width * 0.62, room * 0.9)
        if (height < u * 0.015) return
        val cw = width * (height / (width * 0.62))
        val cx = hero.midX
        val base = hero.minY - room * 0.05
        val top = base - height
        val shape = polygon(
            Pair(cx - cw / 2, base), Pair(cx - cw / 2, top + height * 0.25), Pair(cx - cw / 4, top + height * 0.55),
            Pair(cx, top), Pair(cx + cw / 4, top + height * 0.55), Pair(cx + cw / 2, top + height * 0.25),
            Pair(cx + cw / 2, base),
        )
        canvas.save()
        canvas.clipPath(shape)
        linear(
            canvas, listOf(mix(hex, "#FFFFFF", 0.45), CallFrameRenderKit.color(hex), mix(hex, "#000000", 0.25)),
            cx - cw / 2, top, cx + cw / 2, base,
        )
        canvas.restore()
        val jewels = Path()
        listOf(cx - cw / 2, cx, cx + cw / 2).forEachIndexed { index, x -> jewels.circle(x, if (index == 1) top else top + height * 0.25, cw * 0.06) }
        fill(canvas, jewels, CallFrameRenderKit.color(hex))
        fill(canvas, Path().apply { rect(cx - cw / 2, base - height * 0.16, cw, height * 0.08) }, mix(hex, "#000000", 0.35))
    }

    fun ribbon(canvas: Canvas, scene: CallFrameOrnamentStage, hex: String) {
        val u = scene.unit
        val headline = scene.headline
        val zone = headline ?: if (scene.top.height >= u * 0.05) scene.top else scene.bottom
        if (zone.height < u * 0.03) return
        val band = if (headline == null) min(zone.height * 0.46, u * 0.1) else min(zone.height * 0.95, u * 0.12)
        val width = if (headline == null) zone.width * 0.8 else min(scene.inner.width * 0.94, zone.width + band * 2.2)
        val cx = zone.midX
        val cy = zone.midY
        val left = cx - width / 2
        val right = cx + width / 2
        val tail = band * 0.9
        val drop = band * 0.28
        val sides = listOf(-1.0, 1.0)
        val tails = Path()
        sides.forEach { side ->
            val edge = if (side < 0) left + tail * 0.35 else right - tail * 0.35
            val outer = edge + side * tail
            tails.addPath(
                polygon(
                    Pair(edge, cy - band / 2 + drop), Pair(outer, cy - band / 2 + drop),
                    Pair(outer - side * tail * 0.35, cy + drop), Pair(outer, cy + band / 2 + drop),
                    Pair(edge, cy + band / 2 + drop),
                ),
            )
        }
        fill(canvas, tails, mix(hex, "#000000", 0.28))
        val folds = Path()
        sides.forEach { side ->
            val edge = if (side < 0) left + tail * 0.35 else right - tail * 0.35
            val start = if (side < 0) left + tail * 0.7 else right - tail * 0.7
            folds.addPath(polygon(Pair(start, cy + band / 2), Pair(edge, cy + band / 2 + drop), Pair(edge, cy + band / 2)))
        }
        fill(canvas, folds, mix(hex, "#000000", 0.5))
        val cloth = CallFrameRect(left + tail * 0.7, cy - band / 2, width - tail * 1.4, band)
        canvas.save()
        canvas.clipRect(CallFrameRendererKit.rectF(cloth))
        linear(canvas, listOf(mix(hex, "#FFFFFF", 0.2), mix(hex, "#000000", 0.12)), 0.0, cloth.minY, 0.0, cloth.maxY)
        canvas.restore()
    }

    fun tape(canvas: Canvas, scene: CallFrameOrnamentStage, hex: String, seed: Double) {
        val u = scene.unit
        scene.slots.forEachIndexed { index, box ->
            val slot = box.rect
            canvas.save()
            if (box.rotation != 0.0) canvas.rotate(box.rotation.f(), slot.midX.f(), slot.midY.f())
            val length = min(slot.width * 0.3, u * 0.13)
            val thick = length * 0.3
            val pieces = listOf(
                Triple(slot.minX + length * 0.12, slot.minY + thick * 0.2, -0.68),
                Triple(slot.maxX - length * 0.12, slot.minY + thick * 0.2, 0.68),
            )
            pieces.forEachIndexed { side, piece ->
                val turn = piece.third + (rand(seed, (index * 2 + side).toDouble()) - 0.5) * 0.2
                val strip = Path().apply { rect(-length / 2, -thick / 2, length, thick) }.placed(piece.first, piece.second, turn)
                val paint = fillPaint(tint(hex, 0.85)).withShadow(u * 0.004, CallFrameColor(0.0, 0.0, 0.0, 0.12))
                canvas.drawPath(strip, paint)
            }
            canvas.restore()
        }
    }

    fun rec(canvas: Canvas, scene: CallFrameOrnamentStage, ink: CallFrameColor) {
        val u = scene.unit
        val px = u * 0.03
        val left = scene.inner.minX + u * 0.03
        val right = scene.inner.maxX - u * 0.03
        fun isFree(x: Double, y: Double, width: Double): Boolean {
            val probe = CallFrameRect(x, y - px * 0.7, width, px * 1.4)
            return scene.text.none { me.meeshy.sdk.model.call.frames.CallFrameOrnamentGeometry.overlaps(it, probe) }
        }
        val rows = listOf(scene.inner.minY + u * 0.035, scene.inner.maxY - u * 0.035)
        val y = rows.firstOrNull { isFree(left, it, px * 3.2) && isFree(right - px * 6.8, it, px * 6.8) }
            ?: rows.firstOrNull { isFree(left, it, px * 3.2) } ?: return
        val red = CallFrameColor(1.0, 59 / 255.0, 48 / 255.0, 1.0)
        val dot = fillPaint(red).withShadow(px * 0.5, red.copy(alpha = 0.7))
        canvas.drawCircle((left + px * 0.35).f(), y.f(), (px * 0.35).f(), dot)
        text(canvas, "REC", px, ink, left + px * 0.95, y, Paint.Align.LEFT)
        if (isFree(right - px * 6.8, y, px * 6.8)) text(canvas, "00:12:47:09", px, ink, right, y, Paint.Align.RIGHT)
    }

    private fun text(canvas: Canvas, value: String, size: Double, ink: CallFrameColor, x: Double, y: Double, align: Paint.Align) {
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
            textSize = size.f()
            color = argb(ink)
            textAlign = align
        }
        canvas.drawText(value, x.f(), (y - (paint.ascent() + paint.descent()) / 2).toFloat(), paint)
    }

    fun cobwebs(canvas: Canvas, width: Double, height: Double, unit: Double, density: CallFrameDensity, ink: CallFrameColor) {
        val span = unit * 0.24
        val corners = listOf(
            listOf(0.0, 0.0, 1.0, 1.0), listOf(width, 0.0, -1.0, 1.0),
            listOf(width, height, -1.0, -1.0), listOf(0.0, height, 1.0, -1.0),
        )
        val chosen = corners.take(when (density) { CallFrameDensity.HIGH -> 4; CallFrameDensity.MID -> 2; CallFrameDensity.LOW -> 1 })
        chosen.forEach { (cx, cy, sx, sy) ->
            val spokes = (0 until 6).map { it / 5.0 * (PI / 2) }
            fun tip(angle: Double, radius: Double) = Pair(cx + sx * cos(angle) * radius, cy + sy * sin(angle) * radius)
            val web = Path()
            spokes.forEach { angle ->
                web.move(cx, cy)
                tip(angle, span).let { web.line(it.first, it.second) }
            }
            listOf(0.25, 0.45, 0.65, 0.85).forEach { share ->
                spokes.drop(1).forEachIndexed { index, angle ->
                    val from = tip(spokes[index], span * share)
                    val to = tip(angle, span * share)
                    val sag = tip((angle + spokes[index]) / 2, span * share * 0.86)
                    if (index == 0) web.move(from.first, from.second)
                    web.quad(sag.first, sag.second, to.first, to.second)
                }
            }
            stroke(canvas, web, ink, max(0.5, unit * 0.0016))
        }
    }

    fun drips(canvas: Canvas, width: Double, unit: Double, density: CallFrameDensity, seed: Double, ink: CallFrameColor) {
        val total = count(12.0, density)
        val lip = unit * 0.018
        val path = Path()
        path.move(0.0, 0.0)
        path.line(0.0, lip)
        (0 until total).forEach { index ->
            val center = (index + 0.5) / total * width
            val radius = unit * (0.008 + rand(seed, index.toDouble()) * 0.01)
            val length = unit * (0.02 + rand(seed + 1, index.toDouble()) * 0.1)
            path.line(center - radius * 1.6, lip)
            path.quad(center - radius, lip, center - radius, lip + length * 0.5)
            path.line(center - radius, lip + length)
            path.canvasArc(center, lip + length, radius, PI, 0.0, anticlockwise = true)
            path.line(center + radius, lip + length * 0.5)
            path.quad(center + radius, lip, center + radius * 1.6, lip)
        }
        path.line(width, lip)
        path.line(width, 0.0)
        path.close()
        fill(canvas, path, ink)
    }

    fun candles(canvas: Canvas, scene: CallFrameOrnamentStage, hex: String, density: CallFrameDensity, seed: Double) {
        val u = scene.unit
        val zone = if (scene.front) scene.bottom else CallFrameRect(0.0, scene.height * 0.8, scene.width, scene.height * 0.2)
        if (zone.height < u * 0.04) return
        val bodyWidth = u * 0.024
        val floor = zone.maxY - u * 0.01
        (0 until count(4.0, density)).forEach { index ->
            val leftSide = index % 2 == 0
            val rank = (index / 2).toDouble()
            val x = if (leftSide) zone.minX + bodyWidth * (1.2 + rank * 2.2) else zone.maxX - bodyWidth * (1.2 + rank * 2.2)
            val height = min(zone.height * 0.6, u * (0.05 + rand(seed, index.toDouble()) * 0.05))
            val top = floor - height
            canvas.save()
            canvas.clipRect((x - bodyWidth / 2).f(), top.f(), (x + bodyWidth / 2).f(), (top + height).f())
            val wax = LinearGradient(
                (x - bodyWidth / 2).f(), 0f, (x + bodyWidth / 2).f(), 0f,
                intArrayOf(argb(CallFrameRenderKit.color("#D9CBB0")), argb(CallFrameRenderKit.color("#F7F0E1")), argb(CallFrameRenderKit.color("#BFAF93"))),
                floatArrayOf(0f, 0.45f, 1f), Shader.TileMode.CLAMP,
            )
            canvas.drawPaint(Paint().apply { shader = wax })
            canvas.restore()
            glowDisc(canvas, x, top - bodyWidth * 0.9, bodyWidth * 2.6, CallFrameRenderKit.color(hex), 0.5)
            val flame = Path().apply {
                move(x, top - bodyWidth * 1.6)
                quad(x + bodyWidth * 0.42, top - bodyWidth * 0.5, x, top - bodyWidth * 0.12)
                quad(x - bodyWidth * 0.42, top - bodyWidth * 0.5, x, top - bodyWidth * 1.6)
            }
            canvas.save()
            canvas.clipPath(flame)
            linear(canvas, listOf(WHITE, CallFrameRenderKit.color(hex)), 0.0, top - bodyWidth * 1.5, 0.0, top)
            canvas.restore()
        }
    }
}
