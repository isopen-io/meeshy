package me.meeshy.app.chat.export

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.Crossfade
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.painter.BitmapPainter
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt
import me.meeshy.feature.chat.R
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

internal object CardExportStage {
    const val CARD_TAG = "card-export-card"
    const val HINT_TAG = "card-export-hint"

    /** La place gardée SOUS la carte pour l'invite : elle ne se pose jamais sur le pied de la carte. */
    val HINT_ROOM = 40.dp
}

/**
 * L'aperçu : la carte et ses zones, chaque partie se touche et ouvre l'onglet qui la règle. L'invite vit dans une place
 * qui lui est gardée sous la carte, que l'invite soit là ou partie : la carte ne saute pas quand on la touche.
 */
@Composable
internal fun CardExportStage(
    image: CardImage?,
    failed: Boolean,
    hint: Boolean,
    focus: CardPartId?,
    onPick: (CardPartId) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = MeeshyTheme.tokens
    Column(modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        BoxWithConstraints(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
            when {
                image != null -> {
                    val ratio = (image.layoutWidth / image.layoutHeight).toFloat()
                    val width = minOf(maxWidth, maxHeight * ratio)
                    val scale = with(LocalDensity.current) { width.toPx() } / image.layoutWidth.toFloat()
                    Crossfade(targetState = image, label = "card") { card -> StageCard(card, width, ratio, scale, focus, onPick) }
                }
                failed -> Text(stringResource(R.string.export_announce_failed), color = tokens.error, style = MaterialTheme.typography.bodyMedium)
                else -> Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                    CircularProgressIndicator(Modifier.size(28.dp), strokeWidth = 2.dp)
                    Text(stringResource(R.string.export_card_rendering), color = tokens.textSecondary, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        HintRoom(visible = hint && image != null)
    }
}

/** La place de l'invite garde la hauteur de l'invite, qu'elle soit là ou partie : sa sortie ne fait pas grandir la carte. */
@Composable
private fun HintRoom(visible: Boolean) {
    Box(Modifier.fillMaxWidth().heightIn(min = CardExportStage.HINT_ROOM), contentAlignment = Alignment.Center) {
        HintPill(Modifier.alpha(0f).clearAndSetSemantics { })
        AnimatedVisibility(visible = visible, enter = fadeIn(), exit = fadeOut()) {
            HintPill(Modifier.testTag(CardExportStage.HINT_TAG))
        }
    }
}

@Composable
private fun HintPill(modifier: Modifier) {
    val tokens = MeeshyTheme.tokens
    Text(
        stringResource(R.string.export_card_hint),
        color = tokens.textPrimary,
        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
        modifier = modifier.clip(CircleShape).background(tokens.surfaceFill)
            .padding(horizontal = MeeshySpacing.mdPlus, vertical = MeeshySpacing.sm),
    )
}

@Composable
private fun StageCard(card: CardImage, width: Dp, ratio: Float, scale: Float, focus: CardPartId?, pick: (CardPartId) -> Unit) {
    Box(
        Modifier
            .testTag(CardExportStage.CARD_TAG)
            .size(width, width / ratio)
            .shadow(18.dp, RoundedCornerShape(18.dp))
            .clip(RoundedCornerShape(18.dp)),
    ) {
        Image(
            BitmapPainter(remember(card) { card.bitmap.asImageBitmap() }),
            contentDescription = stringResource(R.string.export_card_hint),
            modifier = Modifier.fillMaxSize().clickable { pick(CardPartId.BACKGROUND) },
        )
        card.regions.forEach { region -> Zone(region, scale, region.part == focus, pick) }
    }
}

@Composable
private fun Zone(region: CardRegion, scale: Float, focused: Boolean, onPick: (CardPartId) -> Unit) {
    val density = LocalDensity.current
    val slop = 8.dp
    val label = CardLabels.part(region.part)
    Box(
        Modifier
            .offset { IntOffset((region.x * scale).roundToInt() - slop.roundToPx(), (region.y * scale).roundToInt() - slop.roundToPx()) }
            .size(
                with(density) { (region.width * scale).toFloat().toDp() } + slop * 2,
                with(density) { (region.height * scale).toFloat().toDp() } + slop * 2,
            )
            .drawBehind {
                if (focused) {
                    drawRoundRect(
                        Color.White.copy(alpha = 0.9f), cornerRadius = CornerRadius(12.dp.toPx()),
                        style = Stroke(2.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(18f, 12f))),
                    )
                }
            }
            .semantics { role = Role.Button; selected = focused; contentDescription = label }
            .clickable { onPick(region.part) },
    )
}
