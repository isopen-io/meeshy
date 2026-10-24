package me.meeshy.ui.component.retouch

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.composer.look.ComposerTakeSound
import me.meeshy.sdk.model.composer.look.ComposerVideoEdit
import me.meeshy.sdk.model.media.MediaTrimBounds
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.component.media.MediaTrimContent
import me.meeshy.ui.component.media.MediaTrimStrip

/** Couper : la bande de rognage sur la vidéo entière ; le son s'y pose dessous tant qu'elle est montrée (#10341). */
@Composable
internal fun RetouchTrimPanel(
    edit: ComposerVideoEdit,
    showsSound: Boolean,
    enabled: Boolean,
    onTrim: (MediaTrimBounds) -> Unit,
    onGain: (Double) -> Unit,
    onMute: () -> Unit,
) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
        MediaTrimStrip(
            content = MediaTrimContent.VIDEO,
            sourceDuration = edit.durationSeconds,
            bounds = edit.window,
            accent = Color.White,
            onChange = { if (enabled) onTrim(it) },
        )
        if (showsSound) RetouchSoundPanel(edit.sound, enabled, onGain, onMute)
    }
}

/** Son : le muet, qui garde le gain, et la ligne de volume de 0 à 200 %, 100 % au milieu. */
@Composable
internal fun RetouchSoundPanel(sound: ComposerTakeSound, enabled: Boolean, onGain: (Double) -> Unit, onMute: () -> Unit) {
    val muteLabel = stringResource(if (sound.muted) R.string.retouch_sound_unmute else R.string.retouch_sound_mute)
    val volumeLabel = stringResource(R.string.retouch_sound_volume)
    val percent = "${ComposerTakeSound.percent(sound.gain)} %"
    Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onMute, enabled = enabled, modifier = Modifier.size(48.dp).semantics { contentDescription = muteLabel }) {
            Icon(if (sound.muted) MeeshyIcons.VolumeOff else MeeshyIcons.VolumeUp, contentDescription = null, tint = Color.White)
        }
        Slider(
            value = sound.gain.toFloat(),
            onValueChange = { onGain(it.toDouble()) },
            enabled = enabled && !sound.muted,
            valueRange = ComposerTakeSound.MIN_GAIN.toFloat()..ComposerTakeSound.MAX_GAIN.toFloat(),
            colors = SliderDefaults.colors(thumbColor = Color.White, activeTrackColor = Color.White),
            modifier = Modifier.weight(1f).semantics {
                contentDescription = volumeLabel
                stateDescription = percent
            },
        )
    }
}
