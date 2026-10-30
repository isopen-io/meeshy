package me.meeshy.app.stories

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.foundation.selection.toggleable
import androidx.compose.ui.semantics.Role
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.composer.sound.ComposerAudioRole
import me.meeshy.sdk.model.composer.sound.ComposerSoundRoles
import me.meeshy.sdk.model.composer.sound.SoundTranscriptions
import me.meeshy.ui.theme.MeeshySpacing

/** La diapo sert l'atténuation des vidéos seulement quand un son de fond joue au-dessus d'une vidéo : sinon l'option n'a pas d'effet. */
internal val StoryComposerUiState.servesVideoDucking: Boolean
    get() = selectedSlideBackgroundSound != null && selectedSlideAttachments.any { it.mimeType.startsWith("video/") }

/** Les sons de la diapo, chacun avec ses réglages, puis l'atténuation des vidéos. */
@Composable
internal fun StorySoundTracks(
    state: StoryComposerUiState,
    composer: StoryComposerViewModel,
    suggestionsAround: (String?) -> List<String>,
) {
    val tracks = state.selectedSlideAudio
    if (tracks.isEmpty()) return
    Text(
        stringResource(R.string.story_sound_sheet_current),
        style = MaterialTheme.typography.labelLarge,
        modifier = Modifier.semantics { heading() },
    )
    tracks.forEach { track ->
        key(track.id) {
            StorySoundTrackCard(state, track, composer, suggestionsAround(track.sourceLanguage))
            HorizontalDivider()
        }
    }
    if (state.servesVideoDucking) {
        val ducks = state.deck.selectedSlide.videosDuckUnderSound
        val label = stringResource(R.string.story_sound_sheet_ducking)
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp).toggleable(value = ducks, role = Role.Switch) { on ->
                composer.onSceneReduce { s -> s.withDeckTransform { it.withSelectedVideosDuck(on) } }
            },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
            Switch(checked = ducks, onCheckedChange = null)
        }
    }
}

@Composable
private fun StorySoundTrackCard(
    state: StoryComposerUiState,
    track: StoryAudioPlayerObject,
    composer: StoryComposerViewModel,
    suggestions: List<String>,
) {
    var trimming by rememberSaveable(track.id) { mutableStateOf(false) }
    val deckOp: ((StorySlideDeck) -> StorySlideDeck) -> Unit = { op -> composer.onSceneReduce { s -> s.withDeckTransform(op) } }
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        SoundTraceRow(sound = track, onToggleMute = { composer.onToggleSoundMute(track.id) }, onRemove = { composer.onRemoveSound(track.id) })
        SoundRoleChips(ComposerSoundRoles.role(track)) { role -> deckOp { it.withSelectedSoundRole(track.id, role) } }
        val volumeLabel = stringResource(R.string.story_sound_sheet_volume)
        Slider(
            value = track.volume,
            onValueChange = { v -> composer.onSceneGesture("sound-volume-${track.id}") { s -> s.withDeckTransform { it.withSelectedSoundVolume(track.id, v) } } },
            modifier = Modifier.fillMaxWidth().semantics {
                contentDescription = volumeLabel
                stateDescription = "${(track.volume * 100).toInt()} %"
            },
        )
        SoundLanguageRow(track.sourceLanguage, suggestions) { code -> deckOp { it.withSelectedSoundLanguage(track.id, code) } }
        val transcription = state.deck.selectedSlide.soundTranscriptions[track.id]
        SoundTranscriptionBlock(transcription, onWrite = { text ->
            val language = track.sourceLanguage ?: suggestions.firstOrNull() ?: return@SoundTranscriptionBlock
            deckOp { it.withSelectedSoundTranscription(track.id, SoundTranscriptions.manual(text, language)) }
        })
        if (state.trimSourceOf(track) != null) {
            TextButton(onClick = { trimming = !trimming }, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(stringResource(R.string.story_sound_sheet_trim))
            }
            if (trimming) SoundTrimSection(state, track, composer)
        }
    }
}

/** Le son préparé : son rôle, sa langue, sa transcription, puis Refaire / Ajouter. */
@Composable
internal fun StorySoundTakeCard(
    sheet: StorySoundSheetState,
    take: SoundTakeDraft,
    automatic: ComposerAudioRole,
    viewModel: StorySoundSheetViewModel,
    onAdd: (ComposerAudioRole) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Text(
            stringResource(R.string.story_sound_sheet_new_take),
            style = MaterialTheme.typography.labelLarge,
            modifier = Modifier.semantics { heading() },
        )
        val uploading = take.phase == SoundTakePhase.UPLOADING
        SoundRoleChips(sheet.chosenRole ?: automatic, viewModel::onRole)
        SoundLanguageRow(sheet.language, sheet.suggestions, enabled = !uploading, onPick = viewModel::onLanguage)
        if (take.phase == SoundTakePhase.TRANSCRIBING) {
            SheetNotice(stringResource(R.string.story_sound_sheet_transcription_running))
            LinearProgressIndicator(Modifier.fillMaxWidth())
        } else {
            SoundTranscriptionBlock(
                transcription = take.transcription,
                onWrite = viewModel::onWriteTranscription,
                notice = take.notice?.let { stringResource(it.message) },
                onRetry = viewModel::onRetryTranscription.takeIf { take.notice == SoundTranscriptionNotice.FAILED && !uploading },
                enabled = !uploading,
            )
        }
        Row(Modifier.fillMaxWidth().padding(top = MeeshySpacing.xs), horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            OutlinedButton(onClick = viewModel::onRedo, enabled = !uploading, modifier = Modifier.weight(1f).heightIn(min = 48.dp)) {
                Text(stringResource(R.string.story_sound_sheet_redo))
            }
            Button(onClick = { onAdd(automatic) }, enabled = take.phase == SoundTakePhase.PREVIEW, modifier = Modifier.weight(1f).heightIn(min = 48.dp)) {
                Text(stringResource(if (uploading) R.string.story_sound_sheet_uploading else R.string.story_sound_sheet_add))
            }
        }
    }
}

private val SoundTranscriptionNotice.message: Int
    get() = when (this) {
        SoundTranscriptionNotice.SERVER -> R.string.story_sound_sheet_transcription_server
        SoundTranscriptionNotice.FAILED -> R.string.story_sound_sheet_transcription_failed
        SoundTranscriptionNotice.SILENT -> R.string.story_sound_sheet_transcription_silent
    }
