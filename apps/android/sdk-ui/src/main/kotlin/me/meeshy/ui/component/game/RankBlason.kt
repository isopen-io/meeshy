package me.meeshy.ui.component.game

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import me.meeshy.sdk.model.game.BlasonViewport
import me.meeshy.sdk.model.game.CrestPiece
import me.meeshy.sdk.model.game.CrestTone
import me.meeshy.sdk.model.game.DivisionNotch
import me.meeshy.sdk.model.game.GameRankCrest
import me.meeshy.sdk.model.game.GloryRank
import me.meeshy.sdk.model.game.MythicSeatRef
import me.meeshy.ui.theme.MeeshyPalette
import kotlin.math.hypot

/** La matière de l'écu : cuivre aux deux premiers rangs, puis bronze, argent, or, platine, obsidienne, et le prisme pour Mythe. */
internal val GloryRank.material: GameMaterial
    get() = when (this) {
        GloryRank.Murmure, GloryRank.Echo -> GameMaterial.COPPER
        GloryRank.Voix, GloryRank.Conteur -> GameMaterial.BRONZE
        GloryRank.Passeur, GloryRank.Polyglotte -> GameMaterial.SILVER
        GloryRank.Ambassadeur, GloryRank.Orateur -> GameMaterial.GOLD
        GloryRank.Oracle -> GameMaterial.PLATINUM
        GloryRank.Legende -> GameMaterial.OBSIDIAN
        GloryRank.Mythe -> GameMaterial.PRISM
    }

/** Ce qu'un blason montre, décidé hors du dessin : le dessin ne fait que le projeter. */
internal data class RankBlasonPlan(
    val rank: GloryRank,
    val material: GameMaterial,
    val compact: Boolean,
    val frame: BlasonViewport,
    val notches: List<DivisionNotch>,
    val edition: Int?,
    val level: Int?,
    val hasRim: Boolean,
    val hasChief: Boolean,
    val hasTenants: Boolean,
    val hasCrown: Boolean,
    val hasHalo: Boolean,
) {
    val showsTenants: Boolean get() = hasTenants && !compact
    val showsRibbon: Boolean get() = hasTenants && !compact
    val showsLevel: Boolean get() = level != null && !compact

    companion object {
        /** À partir d'Ambassadeur, Mee et Meo tiennent l'écu ; couronnés à Légende, auréolés au Mythe. */
        private const val FIRST_TENANT_INDEX = 6
        private const val FIRST_ADORNED_INDEX = 9

        fun of(rank: GloryRank, division5: Int?, level: Int?, mythic: MythicSeatRef?, widthDp: Float): RankBlasonPlan {
            val compact = widthDp < GameRankCrest.COMPACT_BELOW
            val index = rank.ordinal
            val isMythe = rank == GloryRank.Mythe
            return RankBlasonPlan(
                rank = rank,
                material = rank.material,
                compact = compact,
                frame = when {
                    !compact -> GameRankCrest.fullFrame
                    isMythe -> GameRankCrest.compactMythicFrame
                    else -> GameRankCrest.compactFrame
                },
                notches = GameRankCrest.notches(if (isMythe) null else division5),
                edition = if (isMythe) mythic?.edition else null,
                level = level,
                hasRim = index >= 1,
                hasChief = index >= 3,
                hasTenants = index >= FIRST_TENANT_INDEX,
                hasCrown = index >= FIRST_ADORNED_INDEX && !isMythe,
                hasHalo = isMythe,
            )
        }
    }
}

private const val BOX_WIDTH = 200f
private const val BOX_HEIGHT = 184f
private val MEE_SLOT = GameFigureSlot(31.5f, 93.5f, 63f)
private val MEO_SLOT = GameFigureSlot(168.5f, 93.5f, 63f)
private const val SLOT_HEAD_RATIO = 0.27f

private const val SHIELD_D = "M14 10 h72 v38 c0 24 -16 37 -36 45 c-20 -8 -36 -21 -36 -45 z"
private const val RIM_D = "M21 16 h58 v32 c0 19 -12 30 -29 37 c-17 -7 -29 -18 -29 -37 z"
private const val CHIEF_D = "M14 10 h72 v15 h-72z"
private const val RIBBON_D = "M52 140 h96 l-7 8 7 8 h-96 l7 -8z"

/**
 * Le blason d'un rang (miroir de `RankBlasonView`) : un écu par rang, la matière monte du cuivre au prisme ; la
 * décoration propre au rang vient de la table partagée [GameRankCrest] ; le niveau est gravé dans la pointe, la
 * division en cinq encoches dessous ; à partir d'Ambassadeur Mee et Meo tiennent l'écu, couronnés à Légende,
 * auréolés au Mythe, qui porte la Signature unique de son émission. Sous 60 dp le blason se recadre sur l'écu et
 * sa décoration : tenants, ruban et chiffres se taisent.
 *
 * - [division5] : V (5) à I (1), les encoches sous l'écu ; ignorée pour le Mythe.
 * - [level] : le niveau gravé dans la pointe ; nul, rien n'est gravé.
 * - [mythic] : la place servie du Mythe, dont l'émission dessine la Signature unique.
 * - [title] : le nom localisé du rang, écrit sur le ruban (Ambassadeur et au-delà).
 * - [figures] : les films de Mee et de Meo ; nul, un écu sans tenants.
 * - [accessibilityLabel] : nul = décoratif ; l'hôte dit « Voix IV, niveau 34 ».
 */
@Composable
public fun RankBlason(
    rank: GloryRank,
    division5: Int?,
    modifier: Modifier = Modifier,
    level: Int? = null,
    mythic: MythicSeatRef? = null,
    title: String? = null,
    figures: GameFigures? = GameFigures.standard,
    accessibilityLabel: String? = null,
) {
    val measurer = rememberTextMeasurer()
    val onSurface = MaterialTheme.colorScheme.onSurface
    BoxWithConstraints(modifier.aspectRatio(BOX_WIDTH / BOX_HEIGHT).gameAccessibility(accessibilityLabel)) {
        val plan = remember(rank, division5, level, mythic, maxWidth) {
            RankBlasonPlan.of(rank, division5, level, mythic, maxWidth.value)
        }
        Canvas(Modifier.fillMaxSize()) {
            val k = size.width / plan.frame.width.toFloat()
            withTransform({
                scale(k, k, pivot = Offset.Zero)
                translate(-plan.frame.x.toFloat(), -plan.frame.y.toFloat())
            }) {
                drawBlason(plan, title, onSurface, measurer)
            }
        }
        if (plan.showsTenants && figures != null) {
            GameTenantsLayer(figures, viewBoxWidth = BOX_WIDTH, mee = MEE_SLOT, meo = MEO_SLOT)
            if (plan.hasCrown || plan.hasHalo) {
                Canvas(Modifier.fillMaxSize()) {
                    val k = size.width / BOX_WIDTH
                    withTransform({ scale(k, k, pivot = Offset.Zero) }) { drawTenantAdornments(plan) }
                }
            }
        }
    }
}

private fun DrawScope.drawBlason(plan: RankBlasonPlan, title: String?, onSurface: Color, measurer: TextMeasurer) {
    if (plan.hasHalo) drawMythicHalo(GameRankCrest.mythicHalo(plan.edition), plan.compact, onSurface, measurer)
    GameRankCrest.pieces(plan.rank).forEach { drawCrestPiece(it, plan.material) }
    drawShield(plan)
    val level = plan.level
    if (level != null && plan.showsLevel) drawLevel(level, plan.material, measurer)
    if (plan.showsRibbon) drawRibbon(title, measurer)
    plan.notches.forEach { drawNotch(it, onSurface) }
}

// MARK: L'écu

private val EDGE: Color get() = MeeshyPalette.Indigo950
private val ACCENT: Color get() = MeeshyPalette.Indigo600

private fun DrawScope.drawShield(plan: RankBlasonPlan) {
    val shield = cachedGamePath(SHIELD_D)
    translate(50f, 26f) {
        drawPath(shield, plan.material.brush(shield.getBounds()))
        drawPath(shield, EDGE.copy(alpha = 0.35f), style = Stroke(2f))
        if (plan.hasRim) drawPath(cachedGamePath(RIM_D), Color.White.copy(alpha = 0.5f), style = Stroke(2f))
        if (plan.hasChief) drawPath(cachedGamePath(CHIEF_D), EDGE.copy(alpha = 0.16f))
        drawGameSignature(Offset(50f, 55f), 60f, plan.material.ink, SignatureStyle.Engraved, 96f)
    }
}

// MARK: La décoration du rang (table partagée)

private fun strokeColor(tone: CrestTone, material: GameMaterial): Color = when (tone) {
    CrestTone.GOLD -> GameMaterial.GOLD.lineColor
    CrestTone.INK -> material.ink
    CrestTone.METAL -> material.lineColor
}

private fun fill(tone: CrestTone, material: GameMaterial, box: Rect) = when (tone) {
    CrestTone.GOLD -> GameMaterial.GOLD.brush(box)
    CrestTone.INK -> androidx.compose.ui.graphics.SolidColor(material.ink)
    CrestTone.METAL -> material.brush(box)
}

private fun DrawScope.drawCrestPiece(piece: CrestPiece, material: GameMaterial) {
    when (piece) {
        is CrestPiece.Line -> drawLine(
            strokeColor(piece.tone, material),
            Offset(piece.x1.toFloat(), piece.y1.toFloat()), Offset(piece.x2.toFloat(), piece.y2.toFloat()),
            strokeWidth = piece.width.toFloat(), cap = StrokeCap.Round,
        )
        is CrestPiece.Arc -> drawPath(
            arcPath(piece.cx, piece.cy, piece.r, piece.from, piece.to), strokeColor(piece.tone, material),
            style = Stroke(piece.width.toFloat(), cap = StrokeCap.Round, join = StrokeJoin.Round),
        )
        is CrestPiece.Curve -> {
            val path = Path().apply {
                moveTo(piece.x.toFloat(), piece.y.toFloat())
                piece.segments.forEach {
                    cubicTo(it.c1x.toFloat(), it.c1y.toFloat(), it.c2x.toFloat(), it.c2y.toFloat(), it.x.toFloat(), it.y.toFloat())
                }
            }
            drawPath(path, strokeColor(piece.tone, material), style = Stroke(piece.width.toFloat(), cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
        is CrestPiece.Leaf -> {
            val path = leafPath(piece.x1, piece.y1, piece.x2, piece.y2, piece.bulge)
            drawPath(path, fill(piece.tone, material, path.getBounds()))
            drawPath(path, EDGE.copy(alpha = 0.25f), style = Stroke(0.6f))
        }
        is CrestPiece.Dot -> {
            val r = piece.r.toFloat()
            val box = Rect(Offset((piece.cx - piece.r).toFloat(), (piece.cy - piece.r).toFloat()), androidx.compose.ui.geometry.Size(2 * r, 2 * r))
            drawCircle(fill(piece.tone, material, box), radius = r, center = Offset(piece.cx.toFloat(), piece.cy.toFloat()))
            drawCircle(EDGE.copy(alpha = 0.25f), radius = r, center = Offset(piece.cx.toFloat(), piece.cy.toFloat()), style = Stroke(0.6f))
        }
    }
}

/** Un arc tracé dans le sens horaire de `from` à `to` (degrés depuis midi), échantillonné : aucune ambiguïté de sens. */
internal fun arcPath(cx: Double, cy: Double, r: Double, from: Double, to: Double): Path {
    val steps = 48
    val path = Path()
    for (step in 0..steps) {
        val p = GameRankCrest.arcPoint(cx, cy, r, from + (to - from) * step / steps)
        if (step == 0) path.moveTo(p.x.toFloat(), p.y.toFloat()) else path.lineTo(p.x.toFloat(), p.y.toFloat())
    }
    return path
}

/** Une feuille pleine : deux Bézier quadratiques dont le contrôle s'écarte de 2 x `bulge` du milieu. */
internal fun leafPath(x1: Double, y1: Double, x2: Double, y2: Double, bulge: Double): Path {
    val length = maxOf(hypot(x2 - x1, y2 - y1), Math.ulp(1.0))
    val nx = (-(y2 - y1) / length) * bulge * 2
    val ny = ((x2 - x1) / length) * bulge * 2
    val mx = (x1 + x2) / 2
    val my = (y1 + y2) / 2
    return Path().apply {
        moveTo(x1.toFloat(), y1.toFloat())
        quadraticBezierTo((mx + nx).toFloat(), (my + ny).toFloat(), x2.toFloat(), y2.toFloat())
        quadraticBezierTo((mx - nx).toFloat(), (my - ny).toFloat(), x1.toFloat(), y1.toFloat())
        close()
    }
}

// MARK: Le niveau gravé, le ruban, les encoches

/** Un texte posé par le centre de sa LIGNE DE BASE, comme `text-anchor="middle"` + `y` en SVG. */
internal fun DrawScope.drawGameTextOnBaseline(
    measurer: TextMeasurer,
    text: String,
    at: Offset,
    size: Float,
    color: Color,
    weight: FontWeight = FontWeight.Medium,
    family: FontFamily = FontFamily.Default,
    letterSpacing: Float = 0f,
) {
    val layout = measurer.measure(
        text,
        TextStyle(fontSize = size.toSp(), fontWeight = weight, fontFamily = family, letterSpacing = letterSpacing.toSp()),
    )
    drawText(layout, color = color, topLeft = Offset(at.x - layout.size.width / 2f, at.y - layout.firstBaseline))
}

private fun DrawScope.drawLevel(level: Int, material: GameMaterial, measurer: TextMeasurer) {
    val size = GameRankCrest.levelEngravingSize(level).toFloat()
    val x = GameRankCrest.LEVEL_X.toFloat()
    val y = GameRankCrest.LEVEL_Y.toFloat()
    val digits = level.toString()
    drawGameTextOnBaseline(measurer, digits, Offset(x + 0.6f, y + 0.8f), size, Color.White.copy(alpha = 0.35f), FontWeight.ExtraBold)
    drawGameTextOnBaseline(measurer, digits, Offset(x, y), size, material.ink.copy(alpha = 0.85f), FontWeight.ExtraBold)
}

private fun DrawScope.drawRibbon(title: String?, measurer: TextMeasurer) {
    drawPath(cachedGamePath(RIBBON_D), ACCENT)
    if (title.isNullOrEmpty()) return
    drawGameTextOnBaseline(
        measurer, title.uppercase(), Offset(100f, 151.5f), 8.5f, Color.White,
        family = FontFamily.Monospace, letterSpacing = 1.4f,
    )
}

private fun DrawScope.drawNotch(notch: DivisionNotch, offColor: Color) {
    drawLine(
        if (notch.on) ACCENT else offColor.copy(alpha = 0.14f),
        Offset(notch.x.toFloat(), notch.y1.toFloat()), Offset(notch.x.toFloat(), notch.y2.toFloat()),
        strokeWidth = notch.width.toFloat(), cap = StrokeCap.Round,
    )
}

// MARK: Couronnes et auréoles des tenants

/** Légende couronne ses tenants, Mythe les auréole : posées AU-DESSUS de la tête des figures, qui sont des stickers fixes. */
private fun DrawScope.drawTenantAdornments(plan: RankBlasonPlan) {
    listOf(MEE_SLOT, MEO_SLOT).forEach { slot ->
        val head = Offset(slot.centerX, slot.centerY - slot.side * SLOT_HEAD_RATIO)
        if (plan.hasHalo) drawGameHalo(head) else drawGameCrown(head)
    }
}
