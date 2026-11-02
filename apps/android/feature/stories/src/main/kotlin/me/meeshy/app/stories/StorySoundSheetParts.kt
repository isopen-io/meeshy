package me.meeshy.app.stories

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.LanguageData
import me.meeshy.sdk.model.MobileTranscriptionPayload
import me.meeshy.sdk.model.composer.sound.ComposerAudioRole
import me.meeshy.ui.R as UiR
import me.meeshy.ui.component.LanguagePickerDialog
import me.meeshy.ui.component.LanguagePickerOption
import me.meeshy.ui.theme.MeeshySpacing

/** En fond / Sur la scène — deux pastilles, celle qui joue est allumée. */
@Composable
internal fun SoundRoleChips(role: ComposerAudioRole, onRole: (ComposerAudioRole) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        RoleChip(ComposerAudioRole.BACKGROUND, R.string.story_sound_sheet_role_background, role, onRole)
        RoleChip(ComposerAudioRole.FOREGROUND, R.string.story_sound_sheet_role_scene, role, onRole)
    }
}

@Composable
private fun RoleChip(value: ComposerAudioRole, label: Int, current: ComposerAudioRole, onRole: (ComposerAudioRole) -> Unit) {
    FilterChip(
        selected = value == current,
        onClick = { onRole(value) },
        label = { Text(stringResource(label)) },
        modifier = Modifier.heightIn(min = 48.dp),
    )
}

/** La langue du son : les langues de l'auteur en pastilles, « Plus » ouvre tout le catalogue. */
@Composable
internal fun SoundLanguageRow(selected: String?, suggestions: List<String>, enabled: Boolean = true, onPick: (String) -> Unit) {
    var picking by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        Text(stringResource(R.string.story_sound_sheet_language), style = MaterialTheme.typography.labelMedium)
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            suggestions.forEach { code ->
                FilterChip(
                    selected = code == selected,
                    onClick = { onPick(code) },
                    label = { Text(languageLabel(code)) },
                    enabled = enabled,
                    modifier = Modifier.heightIn(min = 48.dp),
                )
            }
            FilterChip(
                selected = false,
                onClick = { picking = true },
                label = { Text(stringResource(R.string.story_sound_sheet_language_more)) },
                enabled = enabled,
                modifier = Modifier.heightIn(min = 48.dp),
            )
        }
    }
    if (picking) {
        LanguagePickerDialog(
            titleText = stringResource(R.string.story_sound_sheet_language),
            options = LanguageData.allLanguagesCommonFirst.map {
                LanguagePickerOption(code = it.code, label = "${it.flag}  ${it.nativeName}", isSelected = it.code == selected)
            },
            onSelect = { code ->
                code?.let(onPick)
                picking = false
            },
            onDismiss = { picking = false },
            dismissButtonLabel = stringResource(UiR.string.common_cancel),
        )
    }
}

private fun languageLabel(code: String): String = LanguageData.info(code)?.let { "${it.flag} ${it.nativeName}" } ?: code

/**
 * La transcription d'un son : son texte, puis « Modifier » (ou « Rédiger » quand il n'y en a pas) — le texte écrit
 * remplace ce que l'appareil a entendu ; un texte vide la retire.
 */
@Composable
internal fun SoundTranscriptionBlock(
    transcription: MobileTranscriptionPayload?,
    onWrite: (String) -> Unit,
    notice: String? = null,
    onRetry: (() -> Unit)? = null,
    enabled: Boolean = true,
) {
    var editing by rememberSaveable { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        Text(stringResource(R.string.story_sound_sheet_transcription), style = MaterialTheme.typography.labelMedium)
        transcription?.text?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
        notice?.let { SheetNotice(it) }
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            val label = if (transcription == null) R.string.story_sound_sheet_transcription_write else R.string.story_sound_sheet_transcription_edit
            TextButton(onClick = { editing = true }, enabled = enabled, modifier = Modifier.heightIn(min = 48.dp)) { Text(stringResource(label)) }
            onRetry?.let {
                TextButton(onClick = it, modifier = Modifier.heightIn(min = 48.dp)) {
                    Text(stringResource(R.string.story_sound_sheet_transcription_retry))
                }
            }
        }
    }
    if (editing) {
        TranscriptionDialog(transcription?.text.orEmpty(), onDismiss = { editing = false }) {
            onWrite(it)
            editing = false
        }
    }
}

@Composable
private fun TranscriptionDialog(initial: String, onDismiss: () -> Unit, onSave: (String) -> Unit) {
    var text by rememberSaveable { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.story_sound_sheet_transcription)) },
        text = { OutlinedTextField(value = text, onValueChange = { text = it }, modifier = Modifier.fillMaxWidth(), minLines = 3) },
        confirmButton = { TextButton(onClick = { onSave(text) }) { Text(stringResource(R.string.stories_audience_picker_done)) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.stories_audience_picker_cancel)) } },
    )
}
