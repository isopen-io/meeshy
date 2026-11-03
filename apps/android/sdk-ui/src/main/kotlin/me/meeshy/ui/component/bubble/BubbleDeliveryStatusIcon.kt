package me.meeshy.ui.component.bubble

import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.DeliveryGlyph
import me.meeshy.sdk.model.DeliveryGlyphLabel
import me.meeshy.sdk.model.DeliveryGlyphShape
import me.meeshy.sdk.model.DeliveryGlyphState
import me.meeshy.sdk.model.DeliveryGlyphTone
import me.meeshy.sdk.model.DeliveryGlyphs
import me.meeshy.sdk.model.ReadShade
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La coche d'un message envoyé (iOS `BubbleDeliveryCheck`), version statut de bulle : horloge en cours
 * d'envoi (orange si lent), sablier orange hors ligne, ✓ / ✓✓ dans la couleur méta, ✓✓ lu en indigo
 * 600 (clair) / 400 (sombre), échec en rouge.
 */
@Composable
internal fun DeliveryStatusIcon(
    status: DeliveryStatus,
    metaColor: Color,
    isSlow: Boolean,
    readTintOverride: Color? = null,
) {
    val state = when (status) {
        DeliveryStatus.Pending -> if (isSlow) DeliveryGlyphState.Slow else DeliveryGlyphState.Sending
        DeliveryStatus.QueuedOffline -> DeliveryGlyphState.Sending
        DeliveryStatus.Sent -> DeliveryGlyphState.Sent
        DeliveryStatus.Delivered -> DeliveryGlyphState.Delivered
        DeliveryStatus.Read -> DeliveryGlyphState.Read
        DeliveryStatus.Failed -> DeliveryGlyphState.Failed
    }
    DeliveryGlyphIcon(
        glyph = DeliveryGlyphs.resolve(state, isOffline = status == DeliveryStatus.QueuedOffline),
        metaColor = metaColor,
        readTint = readTintOverride ?: defaultReadTint(),
    )
}

@Composable
internal fun defaultReadTint(onOverlay: Boolean = false): Color =
    when (DeliveryGlyphs.readShade(isDark = MeeshyTheme.isDark, onOverlay = onOverlay)) {
        ReadShade.Indigo400 -> MeeshyPalette.Indigo400
        ReadShade.Indigo600 -> MeeshyPalette.Indigo600
    }

/** Rend un [DeliveryGlyph] résolu par la loi ; une forme absente ne rend rien. */
@Composable
internal fun DeliveryGlyphIcon(glyph: DeliveryGlyph, metaColor: Color, readTint: Color) {
    val tint = when (glyph.tone) {
        DeliveryGlyphTone.Meta -> metaColor
        DeliveryGlyphTone.MetaFaded -> metaColor.copy(alpha = metaColor.alpha * DeliveryGlyphs.CLOCK_OPACITY)
        DeliveryGlyphTone.Warning -> MeeshyPalette.Warning
        DeliveryGlyphTone.Read -> readTint
        DeliveryGlyphTone.Error -> MeeshyPalette.Error
    }
    val description = glyph.label?.let { stringResource(deliveryLabelRes(it)) }
    val (icon, size) = when (glyph.shape) {
        DeliveryGlyphShape.None -> return
        DeliveryGlyphShape.Clock -> MeeshyIcons.ScheduleFilled to 12.dp
        DeliveryGlyphShape.Hourglass -> MeeshyIcons.Hourglass to 12.dp
        DeliveryGlyphShape.Check -> MeeshyIcons.Done to 13.dp
        DeliveryGlyphShape.DoubleCheck ->
            MeeshyIcons.DoneAll to if (glyph.tone == DeliveryGlyphTone.Read) 15.dp else 14.dp
        DeliveryGlyphShape.ErrorCircle -> MeeshyIcons.ErrorFilled to 12.dp
    }
    Icon(imageVector = icon, contentDescription = description, tint = tint, modifier = Modifier.size(size))
}

internal fun deliveryLabelRes(label: DeliveryGlyphLabel): Int = when (label) {
    DeliveryGlyphLabel.OfflinePending -> R.string.bubble_footer_offline_pending
    DeliveryGlyphLabel.Sending -> R.string.bubble_status_pending
    DeliveryGlyphLabel.Slow -> R.string.bubble_footer_slow
    DeliveryGlyphLabel.Sent -> R.string.bubble_status_sent
    DeliveryGlyphLabel.Delivered -> R.string.bubble_status_delivered
    DeliveryGlyphLabel.Read -> R.string.bubble_status_read
    DeliveryGlyphLabel.Failed -> R.string.bubble_status_failed
}
