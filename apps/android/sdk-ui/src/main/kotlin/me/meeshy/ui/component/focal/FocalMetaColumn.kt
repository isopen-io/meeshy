package me.meeshy.ui.component.focal

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.reading.focal.FocalMetrics
import me.meeshy.ui.R
import me.meeshy.ui.component.bubble.DeliveryStatus
import me.meeshy.ui.component.bubble.DeliveryStatusIcon
import me.meeshy.ui.format.bubbleClockLabel
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

/** Au-delà de ce seuil d'opacité, les coches sont lisibles donc touchables (jamais une cible invisible). */
private const val CHECKS_TOUCHABLE_ALPHA = 0.5f

/** Teinte méta : noir / blanc à 55 % (iOS `FocalMetrics.MetaText`). */
@Composable
internal fun focalMetaTint(): Color =
    if (MeeshyTheme.isDark) {
        Color.White.copy(alpha = FocalMetrics.MetaText.DARK_OPACITY.toFloat())
    } else {
        Color.Black.copy(alpha = FocalMetrics.MetaText.LIGHT_OPACITY.toFloat())
    }

/**
 * La colonne méta (iOS `FocalMetaColumn`), alignée en bas à droite de la rangée : « modifié »
 * toujours lisible, l'heure (10,5) et les coches de livraison révélées par [metaAlpha] pendant et
 * juste après le défilement (fondu de 0,28 s tenu par l'hôte, lu au DESSIN : aucun relayout, aucune
 * recomposition de rangée). Leur place est réservée en permanence — largeur minimale de 62 — donc
 * rien ne bouge quand elles paraissent. Les coches d'un message envoyé ouvrent, au toucher, les
 * détails de lecture ([onShowReadStatus]) ; un message reçu ne porte que sa date.
 */
@Composable
public fun FocalMetaColumn(
    input: FocalRowInput,
    metaAlpha: () -> Float,
    modifier: Modifier = Modifier,
    onShowReadStatus: (() -> Unit)? = null,
) {
    val tint = focalMetaTint()
    val readTint = if (MeeshyTheme.isDark) MeeshyPalette.Indigo400 else MeeshyPalette.Indigo600
    val clock = remember(input.createdAtIso) { bubbleClockLabel(input.createdAtIso) }
    val showsChecks = input.isMe && input.deliveryStatus != DeliveryStatus.Failed
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp, Alignment.End),
        modifier = modifier
            .widthIn(min = FocalMetrics.MetaColumn.RESERVED_WIDTH.toFloat().dp)
            .padding(bottom = 2.dp),
    ) {
        if (input.isEdited) {
            Icon(
                imageVector = MeeshyIcons.Edit,
                contentDescription = stringResource(R.string.bubble_edited),
                tint = tint,
                modifier = Modifier.size(10.dp),
            )
        }
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            modifier = Modifier
                .graphicsLayer { alpha = metaAlpha() }
                .let { base ->
                    if (!showsChecks || onShowReadStatus == null) base
                    else base
                        .clip(RoundedCornerShape(4.dp))
                        .clickable { if (metaAlpha() >= CHECKS_TOUCHABLE_ALPHA) onShowReadStatus() }
                },
        ) {
            if (clock != null) {
                Text(
                    text = clock,
                    fontSize = TIME_SIZE_SP.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = tint,
                    maxLines = 1,
                )
            }
            if (showsChecks) {
                DeliveryStatusIcon(
                    status = input.deliveryStatus,
                    metaColor = tint,
                    isSlow = input.isSlowSend,
                    readTintOverride = readTint,
                )
            }
        }
    }
}

private const val TIME_SIZE_SP = 10.5f
