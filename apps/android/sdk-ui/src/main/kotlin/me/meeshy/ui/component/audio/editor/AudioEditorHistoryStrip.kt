package me.meeshy.ui.component.audio.editor

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.audioedit.AudioEditDocument
import me.meeshy.sdk.model.audioedit.AudioEditHistoryKind
import me.meeshy.sdk.model.audioedit.AudioEditorTool
import me.meeshy.sdk.model.audioedit.historyKind
import me.meeshy.ui.R
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.LocalMeeshyTokens
import me.meeshy.ui.theme.MeeshySpacing

@Composable
internal fun historyLabel(kind: AudioEditHistoryKind): String = stringResource(
    when (kind) {
        AudioEditHistoryKind.ORIGINAL -> R.string.audio_editor_op_original
        AudioEditHistoryKind.TRIM -> R.string.audio_editor_op_trim
        AudioEditHistoryKind.REMOVE_RANGE -> R.string.audio_editor_op_removerange
        AudioEditHistoryKind.FADE -> R.string.audio_editor_op_fade
        AudioEditHistoryKind.SPEED -> R.string.audio_editor_op_speed
        AudioEditHistoryKind.GAIN -> R.string.audio_editor_op_gain
    },
)

internal fun historyIcon(kind: AudioEditHistoryKind): ImageVector = when (kind) {
    AudioEditHistoryKind.ORIGINAL -> MeeshyIcons.Waveform
    AudioEditHistoryKind.TRIM -> MeeshyIcons.Cut
    AudioEditHistoryKind.REMOVE_RANGE -> MeeshyIcons.VerticalSplit
    AudioEditHistoryKind.FADE -> MeeshyIcons.VolumeUp
    AudioEditHistoryKind.SPEED -> MeeshyIcons.Speed
    AudioEditHistoryKind.GAIN -> MeeshyIcons.Tune
}

internal fun toolIcon(tool: AudioEditorTool): ImageVector = when (tool) {
    AudioEditorTool.TRIM -> MeeshyIcons.Cut
    AudioEditorTool.SPLIT -> MeeshyIcons.VerticalSplit
    AudioEditorTool.FADE -> MeeshyIcons.VolumeUp
    AudioEditorTool.SPEED -> MeeshyIcons.Speed
    AudioEditorTool.VOLUME -> MeeshyIcons.Tune
    AudioEditorTool.TRANSCRIBE -> MeeshyIcons.Subtitles
}

@Composable
internal fun toolLabel(tool: AudioEditorTool): String = stringResource(
    when (tool) {
        AudioEditorTool.TRIM -> R.string.audio_editor_tool_trim
        AudioEditorTool.SPLIT -> R.string.audio_editor_tool_split
        AudioEditorTool.FADE -> R.string.audio_editor_tool_fade
        AudioEditorTool.SPEED -> R.string.audio_editor_tool_speed
        AudioEditorTool.VOLUME -> R.string.audio_editor_tool_volume
        AudioEditorTool.TRANSCRIBE -> R.string.audio_editor_tool_transcribe
    },
)

/** Le journal des versions — des pastilles à parcourir : toucher l'une revient à cette version. */
@Composable
internal fun AudioEditorHistoryStrip(
    document: AudioEditDocument,
    accent: Color,
    enabled: Boolean,
    onSelect: (versionId: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = LocalMeeshyTokens.current
    val haptics = rememberMeeshyHaptics()
    Row(
        modifier.horizontalScroll(rememberScrollState()).padding(horizontal = MeeshySpacing.xxs),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        document.versions.forEachIndexed { index, version ->
            val active = index == document.cursor
            val kind = version.operation.historyKind
            Row(
                Modifier
                    .clip(CircleShape)
                    .background(if (active) accent else tokens.textPrimary.copy(alpha = 0.06f))
                    .semantics { role = Role.Tab; selected = active }
                    .clickable(enabled = enabled) { haptics.light(); onSelect(version.id) }
                    .padding(horizontal = MeeshySpacing.smPlus, vertical = MeeshySpacing.xsPlus),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            ) {
                val tint = if (active) Color.White else tokens.textSecondary
                Icon(historyIcon(kind), null, Modifier.size(12.dp), tint = tint)
                Text(historyLabel(kind), color = tint, fontSize = 12.sp, fontWeight = FontWeight.Medium, maxLines = 1)
            }
        }
    }
}
