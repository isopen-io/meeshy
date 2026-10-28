package me.meeshy.app.stories

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.composer.sound.SoundCredit
import me.meeshy.sdk.model.composer.sound.SoundTraceBars
import me.meeshy.sdk.model.composer.sound.StoryAudioIdentity
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette

private const val BAR_COUNT = 14

/**
 * Le panneau du Son : « Bibliothèque » ouvre l'étagère, puis une trace par piste de la slide — note, onde
 * (enregistrement seulement) OU titre et crédit (emprunt, sans onde : le crédit a besoin de la place), durée, muet
 * LOCAL et retrait. Le muet n'est pas une suppression : la piste reste posée, son niveau est mémorisé.
 */
@Composable
internal fun ComposerSoundPanel(
    audio: List<StoryAudioPlayerObject>,
    canAddSound: Boolean,
    onOpenShelf: () -> Unit,
    @androidx.annotation.StringRes capRefusal: Int = R.string.composer_scene_cap_sound,
    onToggleMute: (String) -> Unit,
    onRemove: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        BandTile(
            icon = { Icon(MeeshyIcons.QueueMusic, contentDescription = null) },
            label = stringResource(R.string.story_composer_soundLibrary),
            enabled = true,
            onClick = rememberGuardedAddition(canAddSound, capRefusal, onOpenShelf),
            modifier = Modifier.fillMaxWidth(),
        )
        audio.forEach { track ->
            SoundTraceRow(
                sound = track,
                onToggleMute = { onToggleMute(track.id) },
                onRemove = { onRemove(track.id) },
            )
        }
    }
}

/** La rangée note · onde · crédit · durée, avec ses deux gestes. La durée ne se tronque JAMAIS, l'attribution cède. */
@Composable
internal fun SoundTraceRow(
    sound: StoryAudioPlayerObject,
    onToggleMute: () -> Unit,
    onRemove: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tint = if (sound.isMuted) MaterialTheme.colorScheme.outline else MeeshyPalette.Indigo400
    val role = stringResource(R.string.composer_sound_background_a11y)
    val credit = SoundCredit.label(sound)
    val muteLabel = stringResource(
        if (sound.isMuted) R.string.composer_capture_sound_unmute else R.string.composer_capture_sound_mute,
    )
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            modifier = Modifier
                .weight(1f)
                .clearAndSetSemantics {
                    contentDescription = if (sound.isBackground == true && credit.isNotEmpty()) "$role, $credit" else credit.ifEmpty { role }
                },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(MeeshyIcons.MusicNote, contentDescription = null, tint = tint, modifier = Modifier.size(18.dp))
            if (StoryAudioIdentity.showsWaveform(sound)) SoundWave(sound.waveformSamples, tint)
            val attribution = StoryAudioIdentity.attribution(sound)
            if (attribution.isNotEmpty()) {
                Text(
                    attribution,
                    style = MaterialTheme.typography.labelMedium,
                    color = tint,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
            }
            SoundCredit.durationLabel(sound)?.let { duration ->
                Text(duration, style = MaterialTheme.typography.labelMedium, color = tint, maxLines = 1, softWrap = false)
            }
        }
        IconButton(onClick = onToggleMute, modifier = Modifier.size(44.dp)) {
            Icon(
                if (sound.isMuted) MeeshyIcons.VolumeOff else MeeshyIcons.VolumeUp,
                contentDescription = muteLabel,
                tint = tint,
            )
        }
        IconButton(onClick = onRemove, modifier = Modifier.size(44.dp)) {
            Icon(
                MeeshyIcons.Delete,
                contentDescription = stringResource(R.string.composer_audio_delete_action),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun SoundWave(samples: List<Float>, tint: androidx.compose.ui.graphics.Color) {
    val bars = remember(samples) { SoundTraceBars.heights(samples, BAR_COUNT) }
    Canvas(Modifier.size(width = 44.dp, height = 16.dp).padding(vertical = 0.dp)) {
        val step = size.width / BAR_COUNT
        val barWidth = step * 0.55f
        bars.forEachIndexed { i, fraction ->
            val h = size.height * fraction
            drawRoundRect(
                color = tint,
                topLeft = Offset(i * step + (step - barWidth) / 2, (size.height - h) / 2),
                size = Size(barWidth, h),
                cornerRadius = CornerRadius(barWidth / 2),
            )
        }
    }
}
