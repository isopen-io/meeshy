package me.meeshy.ui.component.game

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt
import me.meeshy.sdk.model.game.FlameFormKey
import me.meeshy.sdk.model.game.GameBannerRect
import me.meeshy.sdk.model.game.GameReferralBannerMetrics
import me.meeshy.sdk.model.game.GameReferralQrSquare
import me.meeshy.sdk.model.game.GameReferralSlot
import me.meeshy.ui.theme.MeeshyRadius

// Le bandeau est une IMAGE partagée hors de l'application : jamais habillé par le thème de celui qui la
// compose. Couleurs FIXES, miroir d'iOS (`ink` 1c1941 à 86 %, `linkInk` c7d2fe).
private val BannerInk = Color(0xFF1C1941).copy(alpha = 0.86f)
private val BannerLinkInk = Color(0xFFC7D2FE).copy(alpha = 0.85f)
private val BannerText = Color.White

public const val GAME_REFERRAL_QR_TAG: String = "game-referral-qr"
public const val GAME_REFERRAL_PLACEHOLDER_TAG: String = "game-referral-qr-placeholder"

/**
 * Le bandeau de parrainage de la carte partagée (#7742, #9554) : un bandeau indigo (86 %) qui porte la
 * Signature, [title] (« Rejoins-moi sur Meeshy »), la Flamme de l'utilisateur et son lien en CARRÉ QR en
 * fin de ligne — retourné en entier en arabe. Tout se dessine à l'échelle de la HAUTEUR offerte.
 *
 * La brique dessine ; elle ne sait rien du lien. JAMAIS monté sans lien (conformité H-8) : sans [link] et hors
 * [preview], rien n'est émis. Dans l'APERÇU, la place du carré est un EMPLACEMENT vide cerné de pointillés
 * (le jeton ne se crée qu'au toucher de « Partager »). Seul le carré s'annonce ([qrLabel]) ; le reste est
 * un décor.
 *
 * @param flameForm la forme de la Flamme ; `null` ⇒ pas de Flamme (retirée, éteinte ou sans série).
 * @param flameLabel « 23 j », sous la Flamme.
 */
@Composable
public fun GameReferralBannerView(
    title: String,
    link: String?,
    qrLabel: String,
    modifier: Modifier = Modifier,
    preview: Boolean = false,
    flameForm: FlameFormKey? = null,
    flameLabel: String? = null,
    rightToLeft: Boolean = LocalLayoutDirection.current == LayoutDirection.Rtl,
) {
    val slot = GameReferralBannerMetrics.slot(link, preview)
    if (slot == GameReferralSlot.Hidden) return
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        BoxWithConstraints(modifier) {
            val density = LocalDensity.current
            val widthPx = with(density) { maxWidth.toPx() }.toDouble()
            val heightPx = with(density) { maxHeight.toPx() }.toDouble()
            val metrics = remember(widthPx, heightPx, rightToLeft, flameForm) {
                GameReferralBannerMetrics.make(widthPx, heightPx, rightToLeft, hasFlame = flameForm != null)
            }
            val k = heightPx.toFloat() / 66f
            Box(Modifier.fillMaxSize()) {
                Decor(metrics, title, flameForm, flameLabel, k, density)
                QrSlot(metrics.qr, slot, link, qrLabel, k, density)
            }
        }
    }
}

private fun Modifier.placed(rect: GameBannerRect, density: Density): Modifier = with(density) {
    this@placed
        .offset { IntOffset(rect.x.roundToInt(), rect.y.roundToInt()) }
        .size(rect.width.toFloat().toDp(), rect.height.toFloat().toDp())
}

@Composable
private fun Decor(
    metrics: GameReferralBannerMetrics,
    title: String,
    flameForm: FlameFormKey?,
    flameLabel: String?,
    k: Float,
    density: Density,
) {
    Box(Modifier.fillMaxSize().clearAndSetSemantics { }) {
        val corner = with(density) { (MeeshyRadius.lg.value * k).toDp() }
        Box(Modifier.fillMaxSize().clip(RoundedCornerShape(corner)).background(BannerInk))
        SignatureMark(color = BannerText, modifier = Modifier.placed(metrics.signature, density), strokeWidth = 110f)
        Box(
            Modifier.placed(metrics.title, density),
            contentAlignment = if (metrics.rightToLeft) Alignment.CenterEnd else Alignment.CenterStart,
        ) {
            BannerLabel(title, metrics.titleSize, FontWeight.ExtraBold, FontFamily.SansSerif, density, metrics.rightToLeft)
        }
        if (flameForm != null) {
            FlameView(form = flameForm, flickers = false, modifier = Modifier.placed(metrics.flame, density))
            if (flameLabel != null) {
                Box(Modifier.placed(metrics.flameLabel, density), contentAlignment = Alignment.TopCenter) {
                    BannerLabel(flameLabel, metrics.flameLabelSize, FontWeight.Medium, FontFamily.Monospace, density, false)
                }
            }
        }
    }
}

/** Une ligne sur une seule ligne qui rétrécit jusqu'à la moitié plutôt que de déborder (`minimumScaleFactor` d'iOS). */
@Composable
private fun BannerLabel(
    text: String,
    sizePx: Double,
    weight: FontWeight,
    family: FontFamily,
    density: Density,
    rightToLeft: Boolean,
) {
    var scale by remember(text, sizePx) { mutableFloatStateOf(1f) }
    val fontSize = with(density) { (sizePx.toFloat() * scale).toSp() }
    BasicText(
        text = text,
        maxLines = 1,
        softWrap = false,
        overflow = TextOverflow.Clip,
        style = TextStyle(
            color = BannerText,
            fontSize = fontSize,
            fontWeight = weight,
            fontFamily = family,
            textAlign = if (rightToLeft) TextAlign.End else TextAlign.Start,
        ),
        onTextLayout = { result ->
            if (result.didOverflowWidth && scale > 0.5f) scale = (scale * 0.9f).coerceAtLeast(0.5f)
        },
    )
}

/** Le carré QR du lien ; ou, sans jeton (aperçu), son EMPLACEMENT : un cadre en pointillé, vide. */
@Composable
private fun QrSlot(
    rect: GameBannerRect,
    slot: GameReferralSlot,
    link: String?,
    qrLabel: String,
    k: Float,
    density: Density,
) {
    when (slot) {
        GameReferralSlot.Qr -> {
            val square = remember(link, rect.width) { GameReferralQrSquare.make(link, rect.width.toInt()) } ?: return
            GameReferralQrSquareView(
                square = square,
                contentDescription = qrLabel,
                modifier = Modifier
                    .offset { IntOffset(rect.x.roundToInt(), rect.y.roundToInt()) }
                    .testTag(GAME_REFERRAL_QR_TAG),
            )
        }
        GameReferralSlot.Placeholder -> {
            val radius = MeeshyRadius.xxs.value * k
            Canvas(
                Modifier
                    .placed(rect, density)
                    .clearAndSetSemantics { testTag = GAME_REFERRAL_PLACEHOLDER_TAG },
            ) {
                val stroke = maxOf(2f, size.width * 0.02f)
                drawRoundRect(
                    color = BannerLinkInk,
                    topLeft = Offset(stroke / 2, stroke / 2),
                    size = Size(size.width - stroke, size.height - stroke),
                    cornerRadius = CornerRadius(radius),
                    style = Stroke(
                        width = stroke,
                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(size.width * 0.08f, size.width * 0.06f)),
                    ),
                )
            }
        }
        GameReferralSlot.Hidden -> Unit
    }
}
