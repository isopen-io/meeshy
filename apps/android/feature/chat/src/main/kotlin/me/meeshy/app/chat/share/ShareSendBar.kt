package me.meeshy.app.chat.share

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.mediacache.ByteSizeFormatter
import me.meeshy.sdk.model.share.ShareGrouping
import me.meeshy.sdk.model.share.ShareLimits
import me.meeshy.sdk.model.share.ShareSendBarState
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyAdaptiveColors
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

internal const val ShareCaptionTestTag = "share.sheet.caption"
internal const val ShareGroupingTogetherTestTag = "share.sheet.grouping.together"
internal const val ShareGroupingSeparatelyTestTag = "share.sheet.grouping.separately"

/** What the bar edits besides its [ShareSendBarState]: the caption and the grouping chosen. */
internal data class ShareSendBarInput(
    val caption: String,
    val grouping: ShareGrouping,
)

internal data class ShareSendBarActions(
    val onCaptionChange: (String) -> Unit,
    val onGroupingChange: (ShareGrouping) -> Unit,
    val onSend: () -> Unit,
)

/**
 * **Zone 4 — la barre Envoyer** (iOS `ShareSendBar`), fixe en bas : bannières sémantiques, légende de 1 à 4
 * lignes (une par envoi), « Ensemble / Séparément » dès deux pièces, bouton capsule qui compte les
 * destinataires. Sans état ni réseau : tout vient de [state], l'accent est un paramètre.
 */
@Composable
internal fun ShareSendBar(
    state: ShareSendBarState,
    input: ShareSendBarInput,
    accentColor: Color,
    actions: ShareSendBarActions,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(MeeshyAdaptiveColors.backgroundSecondary(MeeshyTheme.isDark))
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        state.banners.forEach { ShareSendBanner(it) }
        if (state.showsCaption) ShareCaptionField(input.caption, actions.onCaptionChange, onSend = { if (state.button?.enabled == true) actions.onSend() })
        if (state.showsGrouping) ShareGroupingPicker(input.grouping, actions.onGroupingChange)
        state.button?.let { ShareSendButton(it, accentColor, actions.onSend) }
    }
}

@Composable
private fun ShareSendBanner(banner: ShareSendBarState.Banner) {
    val (icon, color) = bannerStyle(banner)
    val text = bannerText(banner)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(color.copy(alpha = 0.15f))
            .padding(MeeshySpacing.sm)
            .semantics(mergeDescendants = true) { contentDescription = text },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(18.dp))
        Text(text, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textPrimary)
    }
}

private fun bannerStyle(banner: ShareSendBarState.Banner): Pair<ImageVector, Color> = when (banner) {
    ShareSendBarState.Banner.Offline -> MeeshyIcons.WifiOff to MeeshyPalette.Warning
    is ShareSendBarState.Banner.EncryptionExit -> MeeshyIcons.LockOpen to MeeshyPalette.Warning
    is ShareSendBarState.Banner.TooHeavy -> MeeshyIcons.Warning to MeeshyPalette.Error
    ShareSendBarState.Banner.TooManyRecipients -> MeeshyIcons.Groups to MeeshyPalette.Error
}

@Composable
private fun bannerText(banner: ShareSendBarState.Banner): String = when (banner) {
    ShareSendBarState.Banner.Offline -> stringResource(R.string.share_offline)
    is ShareSendBarState.Banner.EncryptionExit -> stringResource(R.string.share_encryption_warning, banner.names.joinToString(", "))
    is ShareSendBarState.Banner.TooHeavy -> stringResource(
        R.string.share_limits_too_heavy,
        banner.files,
        ByteSizeFormatter.format(banner.bytes),
        ShareLimits.MAX_FILES,
        ByteSizeFormatter.format(ShareLimits.MAX_TOTAL_BYTES),
    )
    ShareSendBarState.Banner.TooManyRecipients -> stringResource(R.string.share_limits_recipients)
}

/** La légende (iOS `TextField(axis: .vertical)`, 1…4 lignes, « Envoyer » au clavier). */
@Composable
internal fun ShareCaptionField(caption: String, onChange: (String) -> Unit, onSend: () -> Unit, modifier: Modifier = Modifier) {
    val hint = stringResource(R.string.share_caption_hint)
    val tokens = MeeshyTheme.tokens
    BasicTextField(
        value = caption,
        onValueChange = { onChange(it.take(ShareLimits.MAX_CAPTION_LENGTH)) },
        minLines = 1,
        maxLines = MAX_CAPTION_LINES,
        textStyle = MaterialTheme.typography.bodyLarge.copy(color = tokens.textPrimary),
        cursorBrush = SolidColor(tokens.textPrimary),
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
        keyboardActions = androidx.compose.foundation.text.KeyboardActions(onSend = { onSend() }),
        modifier = modifier
            .fillMaxWidth()
            .testTag(ShareCaptionTestTag)
            .semantics { contentDescription = hint },
        decorationBox = { inner ->
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 44.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(MeeshyAdaptiveColors.inputBackground(MeeshyTheme.isDark))
                    .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
                contentAlignment = Alignment.CenterStart,
            ) {
                if (caption.isEmpty()) Text(hint, style = MaterialTheme.typography.bodyLarge, color = tokens.textMuted)
                inner()
            }
        },
    )
}

internal const val MAX_CAPTION_LINES = 4

@Composable
private fun ShareGroupingPicker(grouping: ShareGrouping, onChange: (ShareGrouping) -> Unit) {
    val options = listOf(
        Triple(ShareGrouping.TOGETHER, R.string.share_grouping_together, ShareGroupingTogetherTestTag),
        Triple(ShareGrouping.SEPARATELY, R.string.share_grouping_separately, ShareGroupingSeparatelyTestTag),
    )
    SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
        options.forEachIndexed { index, (value, label, tag) ->
            SegmentedButton(
                selected = grouping == value,
                onClick = { onChange(value) },
                shape = SegmentedButtonDefaults.itemShape(index, options.size),
                modifier = Modifier.heightIn(min = 48.dp).testTag(tag),
            ) { Text(stringResource(label)) }
        }
    }
}

@Composable
private fun ShareSendButton(button: ShareSendBarState.Button, accentColor: Color, onSend: () -> Unit) {
    val label = sendLabel(button.label)
    val spoken = stringResource(R.string.share_button_a11y, button.recipientCount)
    val fill = if (button.enabled) accentColor else MeeshyTheme.tokens.textMuted.copy(alpha = 0.4f)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clip(CircleShape)
            .background(fill)
            .clickable(enabled = button.enabled, role = Role.Button, onClick = onSend)
            .testTag(ShareSendBarState.SEND_TEST_ID)
            .semantics(mergeDescendants = true) {
                contentDescription = spoken
                if (!button.enabled) disabled()
            },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.titleSmall,
            color = Color.White,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        )
    }
}

@Composable
private fun sendLabel(label: ShareSendBarState.ButtonLabel): String = when (label) {
    is ShareSendBarState.ButtonLabel.Send -> stringResource(R.string.share_button_send, label.count)
    is ShareSendBarState.ButtonLabel.Forward -> stringResource(R.string.share_button_forward, label.count)
    is ShareSendBarState.ButtonLabel.TrimLast -> stringResource(R.string.share_limits_trim, label.count)
}
