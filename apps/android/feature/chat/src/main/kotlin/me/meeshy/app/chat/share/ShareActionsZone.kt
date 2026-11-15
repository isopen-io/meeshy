package me.meeshy.app.chat.share

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.ForwardDurationChoice
import me.meeshy.sdk.model.PublicationTarget
import me.meeshy.sdk.model.PublicationTargetRule
import me.meeshy.sdk.model.share.ShareActionPresentation
import me.meeshy.sdk.model.share.ShareTool
import me.meeshy.sdk.model.share.ShareWithheldReason
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

internal const val SharePublicationChipTestTag = "share-publication-chip"
internal const val ShareToolChipTestTag = "share-tool-chip"
internal const val ShareDurationChipTestTag = "share-duration-chip"
internal const val ShareStudioChipTestTag = "share-studio-chip"

/** Ce que la zone lit en plus de la loi : les puces cochées, l'envoi et la capture in-app. */
internal data class ShareActionsZoneSnapshot(
    val selectedPublications: List<PublicationTarget> = emptyList(),
    /** Après un envoi, les puces de publication sont inertes. */
    val hasSent: Boolean = false,
    /** Le média publiable vient d'être capturé par l'app : publier exige une confirmation. */
    val capturedInApp: Boolean = false,
)

internal data class ShareActionsZoneActions(
    val onTogglePublication: (PublicationTarget) -> Unit,
    val onStudio: () -> Unit,
    val onTool: (ShareTool) -> Unit,
)

/**
 * **La zone « ce qu'on peut en faire »** (iOS `actionsZone`) — publications cochables comme des
 * destinataires, studio, outils, puis UNE ligne grise qui dit pourquoi le reste n'est pas rendu.
 * Une action interdite n'est pas rendue du tout.
 */
@Composable
internal fun ShareActionsZone(
    presentation: ShareActionPresentation,
    snapshot: ShareActionsZoneSnapshot,
    accentColor: Color,
    actions: ShareActionsZoneActions,
    modifier: Modifier = Modifier,
) {
    if (presentation.isEmpty) return
    var pendingCapture by rememberSaveable { mutableStateOf<PublicationTarget?>(null) }
    Column(
        modifier = modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        if (presentation.showsPublishRow) {
            Text(
                stringResource(R.string.share_publish_section),
                style = MaterialTheme.typography.labelMedium,
                color = MeeshyTheme.tokens.textMuted,
                modifier = Modifier.semantics { heading() },
            )
            PublishRow(presentation, snapshot, accentColor, actions) { target ->
                val needsConfirmation = PublicationTargetRule.needsCaptureConfirmation(snapshot.capturedInApp, target)
                if (target !in snapshot.selectedPublications && needsConfirmation) pendingCapture = target
                else actions.onTogglePublication(target)
            }
        }
        if (presentation.tools.isNotEmpty()) ToolsRow(presentation.tools, actions.onTool)
        presentation.withheld?.let { WithheldLine(it) }
    }
    pendingCapture?.let { target ->
        CaptureDialog(
            onConfirm = { actions.onTogglePublication(target); pendingCapture = null },
            onDismiss = { pendingCapture = null },
        )
    }
}

@Composable
private fun PublishRow(
    presentation: ShareActionPresentation,
    snapshot: ShareActionsZoneSnapshot,
    accentColor: Color,
    actions: ShareActionsZoneActions,
    onChip: (PublicationTarget) -> Unit,
) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        items(presentation.publications, key = { it.wire }, contentType = { "publication" }) { target ->
            PublicationChip(target, target in snapshot.selectedPublications, !snapshot.hasSent, accentColor) { onChip(target) }
        }
        if (presentation.studio) item(key = "studio", contentType = "studio") { StudioChip(accentColor, actions.onStudio) }
    }
}

@Composable
private fun PublicationChip(target: PublicationTarget, checked: Boolean, enabled: Boolean, accent: Color, onClick: () -> Unit) {
    val label = stringResource(publicationLabel(target))
    val stateText = if (checked) stringResource(R.string.share_a11y_selected) else ""
    Row(
        modifier = Modifier
            .heightIn(min = 48.dp)
            .clip(CircleShape)
            .background(if (checked) accent else accent.copy(alpha = CHIP_TINT))
            .clickable(enabled = enabled, role = Role.Checkbox, onClick = onClick)
            .padding(horizontal = MeeshySpacing.lg)
            .testTag(SharePublicationChipTestTag)
            .semantics(mergeDescendants = true) {
                contentDescription = if (checked) "$label, $stateText" else label
                selected = checked
            },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        val content = if (checked) Color.White else accent
        Icon(if (checked) MeeshyIcons.CheckCircleFilled else publicationIcon(target), null, tint = content, modifier = Modifier.size(18.dp))
        Text(label, style = MaterialTheme.typography.labelLarge, color = content)
    }
}

@Composable
private fun StudioChip(accent: Color, onClick: () -> Unit) {
    val label = stringResource(R.string.share_target_studio)
    Row(
        modifier = Modifier
            .heightIn(min = 48.dp)
            .clip(CircleShape)
            .border(BorderStroke(1.dp, accent.copy(alpha = STUDIO_BORDER)), CircleShape)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = MeeshySpacing.lg)
            .testTag(ShareStudioChipTestTag),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Icon(MeeshyIcons.ComposeNew, null, tint = accent, modifier = Modifier.size(18.dp))
        Text(label, style = MaterialTheme.typography.labelLarge, color = accent)
    }
}

@Composable
private fun ToolsRow(tools: List<ShareTool>, onTool: (ShareTool) -> Unit) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        items(tools, key = { it.name }, contentType = { "tool" }) { tool ->
            val label = stringResource(toolLabel(tool))
            Row(
                modifier = Modifier
                    .heightIn(min = 48.dp)
                    .clip(CircleShape)
                    .background(MeeshyTheme.tokens.surfaceFill)
                    .clickable(role = Role.Button) { onTool(tool) }
                    .padding(horizontal = MeeshySpacing.md)
                    .testTag(ShareToolChipTestTag),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            ) {
                Icon(toolIcon(tool), null, tint = MeeshyTheme.tokens.textPrimary, modifier = Modifier.size(18.dp))
                Text(label, style = MaterialTheme.typography.labelLarge, color = MeeshyTheme.tokens.textPrimary)
            }
        }
    }
}

@Composable
private fun WithheldLine(reason: ShareWithheldReason) {
    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs), verticalAlignment = Alignment.Top) {
        Icon(MeeshyIcons.Info, null, tint = MeeshyTheme.tokens.textMuted, modifier = Modifier.size(16.dp))
        Text(
            stringResource(withheldText(reason)),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textMuted,
        )
    }
}

@Composable
private fun CaptureDialog(onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        text = { Text(stringResource(R.string.share_capture_warning)) },
        confirmButton = { TextButton(onClick = onConfirm) { Text(stringResource(R.string.share_publish_section)) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.share_target_cancel)) } },
    )
}

/** La rangée de durée d'une flamme transférée — non montée sans choix. */
@Composable
internal fun ShareDurationRow(
    state: ShareDurationRowState,
    accentColor: Color,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (!state.isVisible) return
    val title = stringResource(R.string.share_flame_title)
    Column(
        modifier = modifier.fillMaxWidth().background(MeeshyTheme.tokens.surfaceFill)
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            Icon(MeeshyIcons.Flame, null, tint = MeeshyTheme.tokens.textMuted, modifier = Modifier.size(16.dp))
            Text(
                title,
                style = MaterialTheme.typography.labelMedium,
                color = MeeshyTheme.tokens.textMuted,
                modifier = Modifier.semantics { heading() },
            )
        }
        LazyRow(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            items(state.choices, key = { it.seconds }, contentType = { "duration" }) { choice ->
                DurationChip(choice, state.isSelected(choice), title, accentColor) { onSelect(choice.seconds) }
            }
        }
        Text(stringResource(R.string.share_flame_note), style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textMuted)
    }
}

@Composable
private fun DurationChip(choice: ForwardDurationChoice, selected: Boolean, title: String, accent: Color, onClick: () -> Unit) {
    val spoken = "$title, ${choice.label}"
    Row(
        modifier = Modifier
            .widthIn(min = 48.dp)
            .heightIn(min = 48.dp)
            .clip(CircleShape)
            .background(if (selected) accent else accent.copy(alpha = CHIP_TINT))
            .clickable(role = Role.RadioButton, onClick = onClick)
            .padding(horizontal = MeeshySpacing.lg)
            .testTag(ShareDurationChipTestTag)
            .semantics(mergeDescendants = true) {
                contentDescription = spoken
                this.selected = selected
            },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        Text(choice.label, style = MaterialTheme.typography.labelLarge, color = if (selected) Color.White else accent)
    }
}

private const val CHIP_TINT = 0.12f
private const val STUDIO_BORDER = 0.4f

private fun publicationLabel(target: PublicationTarget): Int = when (target) {
    PublicationTarget.STORY -> R.string.share_publish_story
    PublicationTarget.POST -> R.string.share_publish_feed
    PublicationTarget.REEL -> R.string.share_publish_reel
}

private fun publicationIcon(target: PublicationTarget): ImageVector = when (target) {
    PublicationTarget.STORY -> MeeshyIcons.RadioUnchecked
    PublicationTarget.POST -> MeeshyIcons.GridView
    PublicationTarget.REEL -> MeeshyIcons.Play
}

private fun toolLabel(tool: ShareTool): Int = when (tool) {
    ShareTool.SAVE -> R.string.share_action_save
    ShareTool.COPY_LINK -> R.string.share_action_copy_link
    ShareTool.COPY_TEXT -> R.string.share_action_copy_text
    ShareTool.IMAGER -> R.string.forward_image_discussion
    ShareTool.SHARE_OUT -> R.string.share_action_share_out
}

private fun toolIcon(tool: ShareTool): ImageVector = when (tool) {
    ShareTool.SAVE -> MeeshyIcons.Download
    ShareTool.COPY_LINK -> MeeshyIcons.Link
    ShareTool.COPY_TEXT -> MeeshyIcons.Copy
    ShareTool.IMAGER -> MeeshyIcons.Photo
    ShareTool.SHARE_OUT -> MeeshyIcons.Share
}

private fun withheldText(reason: ShareWithheldReason): Int = when (reason) {
    ShareWithheldReason.SINGLE_PHOTO_NOT_A_REEL -> R.string.share_withheld_single_photo
    ShareWithheldReason.NOT_A_REEL -> R.string.share_withheld_not_a_reel
    ShareWithheldReason.TOO_MANY_FOR_PUBLICATION -> R.string.share_withheld_too_many
    ShareWithheldReason.FLAME -> R.string.share_withheld_flame
    ShareWithheldReason.BLURRED -> R.string.share_withheld_blurred
    ShareWithheldReason.ENCRYPTED -> R.string.share_withheld_encrypted
    ShareWithheldReason.CITES_PROTECTED -> R.string.share_withheld_cites_protected
}
