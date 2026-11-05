package me.meeshy.ui.component.bubble

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.BubbleEditMark
import me.meeshy.sdk.model.BubbleFooterModel
import me.meeshy.sdk.model.BubbleFooterStyle
import me.meeshy.sdk.model.DeliveryGlyphs
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/**
 * La méta de droite du pied (iOS `BubbleFooter`) : marque « modifié », heure `HH:mm` localisée, coche
 * d'un message envoyé, puis « Renvoyer » après un échec que la bande orange ne porte pas. Le style
 * [BubbleFooterStyle.Overlay] pose la capsule sombre en coin ; [BubbleFooterStyle.Compact] reste collé
 * à l'émoji ; la teinte de lecture est toujours indigo (jamais blanche ni grasse).
 */
@Composable
internal fun BubbleMetaTrailing(
    content: BubbleContent,
    metaColor: Color,
    modifier: Modifier = Modifier,
    readTint: Color? = null,
    onShowReadStatus: (() -> Unit)? = null,
    onRetry: (() -> Unit)? = null,
    retryBandShown: Boolean = true,
) {
    val model = remember(content.createdAtIso, content.deliveryStatus, content.isOutgoing, content.isSlowSend,
        content.isEdited, content.isEditSaving, content.editedByModerator, content.isDeleted, retryBandShown) {
        BubbleFooterBuilder.build(content, retryBandShown = retryBandShown)
    }
    val tint = readTint ?: defaultReadTint(onOverlay = model.style == BubbleFooterStyle.Overlay)
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        model.edit?.let { BubbleEditMarkView(it, metaColor) }
        model.timestamp?.let { clock ->
            Text(
                text = clock,
                fontSize = MeeshyFontSize.small,
                fontWeight = if (model.style == BubbleFooterStyle.Overlay) FontWeight.SemiBold else FontWeight.Medium,
                color = metaColor,
                maxLines = 1,
            )
        }
        model.delivery?.let { state ->
            BubbleDeliveryCheck(
                state = state,
                isOffline = model.isOffline,
                metaColor = metaColor,
                readTint = tint,
                sendStartedAtIso = content.createdAtIso,
                uploadPieces = if (content.isPending) content.uploadPieces() else emptyList(),
                onShowReadStatus = onShowReadStatus,
            )
        }
        if (onRetry != null && DeliveryGlyphs.footerShowsRetry(model.isFailed, retryBandShown)) {
            BubbleResendButton(onRetry)
        }
    }
}

/** Le bouton « Renvoyer le message » du pied, avec un haptique léger. */
@Composable
private fun BubbleResendButton(onRetry: () -> Unit) {
    val haptics = rememberMeeshyHaptics()
    val label = stringResource(R.string.bubble_footer_resend)
    Text(
        text = label,
        fontSize = MeeshyFontSize.small,
        fontWeight = FontWeight.SemiBold,
        color = MeeshyPalette.Error,
        modifier = Modifier
            .clickable(onClickLabel = label) {
                haptics.light()
                onRetry()
            }
            .semantics { role = Role.Button },
    )
}

/**
 * Le crayon « modifié » du pied. Pendant l'enregistrement d'une édition ce sont des flèches qui
 * tournent (fixes sous « Réduire les animations ») ; une édition de modérateur se dit en mots.
 */
@Composable
internal fun BubbleEditMarkView(mark: BubbleEditMark, color: Color) {
    when (mark) {
        BubbleEditMark.Edited -> Icon(
            imageVector = MeeshyIcons.EditFilled,
            contentDescription = stringResource(R.string.bubble_edited),
            tint = color,
            modifier = Modifier.size(10.dp),
        )
        BubbleEditMark.EditedByModerator -> Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
        ) {
            Icon(MeeshyIcons.EditFilled, contentDescription = null, tint = color, modifier = Modifier.size(10.dp))
            Text(
                text = stringResource(R.string.bubble_footer_edited_by_moderator),
                fontSize = MeeshyFontSize.small,
                color = color,
                maxLines = 1,
            )
        }
        BubbleEditMark.Saving -> {
            val reduce = LocalReduceMotion.current
            val angle = if (reduce) {
                0f
            } else {
                rememberInfiniteTransition(label = "editSaving").animateFloat(
                    initialValue = 0f,
                    targetValue = 360f,
                    animationSpec = infiniteRepeatable(tween(durationMillis = 1_000, easing = LinearEasing), RepeatMode.Restart),
                    label = "editSavingAngle",
                ).value
            }
            Icon(
                imageVector = MeeshyIcons.Sync,
                contentDescription = stringResource(R.string.bubble_footer_saving_edit),
                tint = color,
                modifier = Modifier.size(10.dp).rotate(angle),
            )
        }
    }
}
