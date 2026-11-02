package me.meeshy.ui.component.game

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import me.meeshy.sdk.model.game.MeeshCoinFace
import me.meeshy.sdk.model.game.MeeshCoinGeometry
import me.meeshy.sdk.model.game.MeeshCoinGeometry.Decor
import me.meeshy.sdk.model.game.MeeshCoinGeometry.Paint
import me.meeshy.sdk.model.game.MeeshCoinLayout

/** Les arrêts de la matière, pris aux jetons du jeu (miroir de `GamePalette.coinPaint`). */
internal val Paint.stops: List<GameStop>
    get() = when (this) {
        Paint.CoinSilver -> GamePalette.coinSilver
        Paint.CoinGold -> GamePalette.coinGold
        Paint.Prism -> GamePalette.prismStops
        Paint.CoinSilverIn -> GamePalette.coinSilverInner
        Paint.CoinGoldIn -> GamePalette.coinGoldInner
        Paint.CoinDiamondIn -> GamePalette.coinDiamondInner
    }

/** L'encre gravée sur la matière : toujours plus sombre qu'elle. */
internal val Paint.ink: Color
    get() = when (this) {
        Paint.CoinSilver, Paint.CoinSilverIn -> GamePalette.coinInk
        Paint.CoinGold, Paint.CoinGoldIn -> GamePalette.coinGoldInk
        Paint.Prism, Paint.CoinDiamondIn -> GamePalette.coinDiamondInk
    }

/**
 * La Meesh, peinte dans le repère 120 × 120 (le canevas est déjà mis à l'échelle) — le MIROIR de `MeeshCoinPainter`
 * (iOS) et de `meesh-coin.tsx` (web) : même ordre de pose, mêmes matières, mêmes encres, mêmes opacités. Le métal, la
 * tranche, les décors du bord, le champ et son guilloché ; puis la face ; enfin les éclats du prisme.
 */
internal class MeeshCoinPainter(
    val geometry: MeeshCoinGeometry,
    val edition: MeeshCoinGeometry.Edition,
    val face: MeeshCoinFace,
) {
    val decor: List<Decor> = face.decor(edition)
    private val ink: Color = edition.field.ink
    private val center = Offset(geometry.center.toFloat(), geometry.center.toFloat())
    private val field = face.field(geometry)
    private val isRoyal = edition.flute == MeeshCoinGeometry.Flute.Iris

    fun has(name: Decor): Boolean = name in decor

    private fun disc(radius: Double): Rect = Rect(center, radius.toFloat())

    private fun discPath(radius: Double): Path = Path().apply { addOval(disc(radius)) }

    private fun shading(stops: List<GameStop>, box: Rect, hollow: Boolean = false): Brush =
        if (hollow) GamePalette.linear(stops, Offset(1f, 0f), Offset(0f, 1f), box) else GamePalette.diagonal(stops, box)

    private fun MeeshCoinLayout.Point.offset() = Offset(x.toFloat(), y.toFloat())

    private fun closed(points: List<MeeshCoinLayout.Point>): Path = Path().apply {
        points.forEachIndexed { i, p -> if (i == 0) moveTo(p.x.toFloat(), p.y.toFloat()) else lineTo(p.x.toFloat(), p.y.toFloat()) }
        close()
    }

    // Le flan : métal, tranche, bord, champ.

    fun DrawScope.drawBlank() {
        val body = disc(geometry.body.radius)
        drawOval(shading(edition.metal.stops, body), body.topLeft, body.size)
        drawFlute()
        if (has(Decor.Beads)) drawBeads()
        if (has(Decor.Cabochons)) drawCabochons()
        val inner = disc(field.radius)
        drawOval(shading(edition.field.stops, inner, hollow = true), inner.topLeft, inner.size)
        drawOval(GamePalette.glint, inner.topLeft, inner.size, style = Stroke(field.stroke.toFloat()))
        if (has(Decor.Veins)) drawVeins()
        if (has(Decor.Rosette)) drawRosette()
        if (has(Decor.Sunburst)) drawSunburst()
    }

    private fun DrawScope.drawFlute() {
        val flute = geometry.body.flute
        val ring = disc(flute.radius)
        val dash = PathEffect.dashPathEffect(flute.dash.map { it.toFloat() }.toFloatArray())
        when (edition.flute) {
            MeeshCoinGeometry.Flute.Rim ->
                drawOval(GamePalette.coinRim, ring.topLeft, ring.size, style = Stroke(flute.width.toFloat(), pathEffect = dash))
            MeeshCoinGeometry.Flute.Ink ->
                drawOval(ink.copy(alpha = 0.7f), ring.topLeft, ring.size, style = Stroke(flute.width.toFloat(), pathEffect = dash))
            MeeshCoinGeometry.Flute.Iris -> drawOval(
                shading(GamePalette.prismStops, ring, hollow = true), ring.topLeft, ring.size,
                style = Stroke(flute.width.toFloat() * IRIS_FLUTE_FACTOR, pathEffect = dash),
            )
        }
    }

    private fun DrawScope.drawBeads() {
        val rings = if (isRoyal) geometry.decor.beads.prism else geometry.decor.beads.gold
        val color = if (isRoyal) GamePalette.glint.copy(alpha = 0.9f) else ink.copy(alpha = 0.55f)
        rings.forEach { ring ->
            MeeshCoinLayout.beads(ring, geometry).forEach { drawCircle(color, ring.dot.toFloat(), it.offset()) }
        }
    }

    private fun DrawScope.drawCabochons() {
        MeeshCoinLayout.cabochons(geometry).forEach { cabochon ->
            val outer = closed(cabochon.outer)
            drawPath(outer, GamePalette.diagonal(GamePalette.diamond, outer.getBounds()))
            drawPath(outer, ink, style = Stroke(width = 0.4f, join = StrokeJoin.Round))
            drawPath(closed(cabochon.table), GamePalette.glint.copy(alpha = 0.8f))
        }
    }

    private fun DrawScope.drawVeins() {
        val veins = geometry.decor.veins
        clipPath(discPath(geometry.body.radius - 1)) {
            veins.paths.forEach {
                drawPath(cachedGamePath(it), GamePalette.coinVein, alpha = veins.opacity.toFloat(),
                    style = Stroke(veins.width.toFloat(), cap = StrokeCap.Round))
            }
        }
    }

    private fun DrawScope.drawRosette() {
        val rosette = geometry.decor.rosette
        clipPath(discPath(field.radius)) {
            MeeshCoinLayout.rosetteCenters(geometry).forEach {
                drawCircle(ink.copy(alpha = rosette.opacity.toFloat()), rosette.radius.toFloat(), it.offset(),
                    style = Stroke(rosette.width.toFloat()))
            }
        }
    }

    private fun DrawScope.drawSunburst() {
        val sunburst = geometry.decor.sunburst
        val color = ink.copy(alpha = sunburst.opacity.toFloat())
        clipPath(discPath(field.radius)) {
            MeeshCoinLayout.sunburst(field.radius, geometry).forEach {
                drawLine(color, it.from.offset(), it.to.offset(), sunburst.width.toFloat(), StrokeCap.Round)
            }
        }
    }

    // L'avers.

    fun DrawScope.drawObverse(measurer: TextMeasurer) {
        drawInscription(measurer)
        drawGameSignature(center, geometry.signature.size.toFloat(), ink, SignatureStyle.Struck, geometry.signature.strokeWidth.toFloat())
    }

    private fun DrawScope.drawInscription(measurer: TextMeasurer) {
        val starred = edition.separator == MeeshCoinGeometry.Separator.Star
        val style = TextStyle(
            fontSize = geometry.inscription.fontSize.toFloat().toSp(), fontWeight = FontWeight.SemiBold,
            fontFamily = FontFamily.Monospace,
        )
        MeeshCoinLayout.inscription(geometry).forEach { glyph ->
            if (starred && glyph.isSeparator) {
                drawPath(closed(MeeshCoinLayout.star(glyph, geometry)), ink)
                return@forEach
            }
            val layout = measurer.measure(glyph.glyph.toString(), style)
            val at = glyph.point.offset()
            rotate(glyph.rotate.toFloat(), at) {
                drawText(layout, color = ink, topLeft = Offset(at.x - layout.size.width / 2f, at.y - layout.size.height / 2f))
            }
        }
    }

    // Le revers.

    fun DrawScope.drawReverse(measurer: TextMeasurer, number: Int, year: Int) {
        edition.birds.forEach {
            drawEngravedBird(it.bird, Offset(it.x.toFloat(), it.y.toFloat()), it.scale.toFloat(), it.flip)
        }
        if (has(Decor.Crown)) drawRoyalCrown()
        if (has(Decor.Laurels)) drawLaurels()
        drawNumber(measurer, number)
        val yearLayout = measurer.measure(
            year.toString(),
            TextStyle(
                fontSize = geometry.year.fontSize.toFloat().toSp(), fontWeight = FontWeight.Medium,
                fontFamily = FontFamily.Monospace, letterSpacing = geometry.year.letterSpacing.toFloat().toSp(),
            ),
        )
        drawText(
            yearLayout, color = ink,
            topLeft = Offset(center.x - yearLayout.size.width / 2f, geometry.year.y.toFloat() - yearLayout.size.height / 2f),
        )
    }

    private fun DrawScope.drawRoyalCrown() {
        val crown = geometry.decor.crown
        listOf(crown.body, crown.band).forEach { d ->
            val path = cachedGamePath(d)
            drawPath(path, GameMaterial.GOLD.brush(path.getBounds()))
            drawPath(path, ink, style = Stroke(crown.width.toFloat(), join = StrokeJoin.Round))
        }
        crown.jewels.forEach { jewel ->
            val gem = Rect(Offset(jewel.x.toFloat(), jewel.y.toFloat()), jewel.r.toFloat())
            drawOval(GamePalette.diagonal(GamePalette.diamond, gem), gem.topLeft, gem.size)
            drawOval(ink, gem.topLeft, gem.size, style = Stroke(crown.width.toFloat() * JEWEL_STROKE_FACTOR))
        }
    }

    /** Deux rameaux encadrent le numéro : la branche gauche est décrite, la droite est son miroir autour de `mirrorX`. */
    private fun DrawScope.drawLaurels() {
        val laurels = geometry.decor.laurels
        val leaves = Path().apply {
            laurels.leaves.map(MeeshCoinLayout::leaf).forEach { leaf ->
                moveTo(leaf.base.x.toFloat(), leaf.base.y.toFloat())
                quadraticBezierTo(leaf.outerControl.x.toFloat(), leaf.outerControl.y.toFloat(), leaf.tip.x.toFloat(), leaf.tip.y.toFloat())
                quadraticBezierTo(leaf.innerControl.x.toFloat(), leaf.innerControl.y.toFloat(), leaf.base.x.toFloat(), leaf.base.y.toFloat())
                close()
            }
        }
        val stem = cachedGamePath(laurels.stem)
        listOf(false, true).forEach { mirrored ->
            scale(scaleX = if (mirrored) -1f else 1f, scaleY = 1f, pivot = Offset(laurels.mirrorX.toFloat(), 0f)) {
                drawPath(stem, ink, alpha = LAUREL_ALPHA, style = Stroke(laurels.stemWidth.toFloat(), cap = StrokeCap.Round))
                drawPath(leaves, ink, alpha = LAUREL_ALPHA)
            }
        }
    }

    /** « Nº » : le N, le o MONTÉ et SOULIGNÉ, puis le nombre en petit, redescendu sur la ligne de base, centrés sur l'axe. */
    private fun DrawScope.drawNumber(measurer: TextMeasurer, value: Int) {
        val spec = geometry.number
        fun part(text: String, size: Double, underline: Boolean = false) = measurer.measure(
            text,
            TextStyle(
                fontSize = size.toFloat().toSp(), fontWeight = FontWeight.ExtraBold,
                textDecoration = if (underline) TextDecoration.Underline else null,
            ),
        )
        val parts = listOf(
            Triple(part(spec.sign, spec.signSize), 0f, 0f),
            Triple(part(spec.ordinal, spec.ordinalSize, underline = true), spec.ordinalRise.toFloat(), 0f),
            Triple(part(value.toString(), spec.valueSize), 0f, spec.valueGap.toFloat()),
        )
        var x = center.x - (parts.sumOf { it.first.size.width.toDouble() } + parts.sumOf { it.third.toDouble() }).toFloat() / 2
        parts.forEach { (layout, rise, gap) ->
            x += gap
            drawText(layout, color = ink, topLeft = Offset(x, spec.y.toFloat() - rise - layout.firstBaseline))
            x += layout.size.width
        }
    }

    // Les éclats du prisme.

    /** [time] : le temps du scintillement, en secondes ; `null` ⇒ immobiles (mouvement réduit, hors écran). */
    fun DrawScope.drawSparkles(time: Double?) {
        geometry.decor.sparkles.points.forEach { point ->
            val tint = GamePalette.sparkles[point.tint % GamePalette.sparkles.size]
            val shape = closed(MeeshCoinLayout.sparkle(point, geometry))
            if (time == null) {
                drawPath(shape, tint)
                return@forEach
            }
            val twinkle = MeeshCoinLayout.twinkle(time - point.delay)
            scale(twinkle.scale.toFloat(), Offset(point.x.toFloat(), point.y.toFloat())) {
                drawPath(shape, tint, alpha = twinkle.opacity.toFloat())
            }
        }
    }

    // Le tout, dans l'ordre de pose.

    /** Le repère 120 × 120 de la pièce, centré et mis à l'échelle du plus petit côté. */
    private inline fun DrawScope.framed(block: DrawScope.() -> Unit) {
        val unit = size.minDimension / geometry.frame.toFloat()
        translate((size.width - size.minDimension) / 2, (size.height - size.minDimension) / 2) {
            scale(unit, pivot = Offset.Zero) { block() }
        }
    }

    /** La pièce immobile ; ses éclats y sont posés fixes sauf quand un calque à part les fait scintiller. */
    fun DrawScope.drawCoin(measurer: TextMeasurer, twinkling: Boolean) = framed {
        drawBlank()
        when (val shown = face) {
            MeeshCoinFace.Blank -> Unit
            MeeshCoinFace.Obverse -> drawObverse(measurer)
            is MeeshCoinFace.Reverse -> drawReverse(measurer, shown.number, shown.year)
        }
        if (has(Decor.Sparkles) && !twinkling) drawSparkles(time = null)
    }

    /** Le calque qui scintille, seul redessiné à chaque image. */
    fun DrawScope.drawTwinkle(time: Double) = framed { drawSparkles(time) }

    private companion object {
        const val IRIS_FLUTE_FACTOR = 1.6f
        const val JEWEL_STROKE_FACTOR = 0.6f
        const val LAUREL_ALPHA = 0.85f
    }
}
