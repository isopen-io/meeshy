package me.meeshy.app.stories

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.TextUnit
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.scene.SceneAudioChipClock
import me.meeshy.sdk.model.scene.SceneAudioChipTiming

/**
 * Ce que lit le chrono d'une puce sonore (#16293). [Playhead] : l'écoulé de la slide, un état observé (le lecteur, son
 * horloge) — la puce y applique la loi de boucle de sa piste. [Live] : la position d'un lecteur vivant (le compositeur),
 * qui n'est pas un état observé et se relit à [LIVE_POLL_MS]. [Still] : rien ne joue, le chrono reste à zéro.
 */
@Stable
internal sealed interface AudioChipClock {
    data object Still : AudioChipClock

    class Playhead(val elapsedSeconds: () -> Double, val isEditPreview: Boolean = false) : AudioChipClock

    class Live(val positionSeconds: () -> Double) : AudioChipClock
}

/** Le chrono de la puce : « M:SS » de la position dans la passe, revenu à zéro à chaque tour d'un son qui boucle. */
@Composable
internal fun AudioChipChrono(timing: SceneAudioChipTiming, clock: AudioChipClock, fontSize: TextUnit, modifier: Modifier = Modifier) {
    val seconds = when (clock) {
        AudioChipClock.Still -> 0L
        is AudioChipClock.Playhead -> rememberPlayheadSecond(timing, clock)
        is AudioChipClock.Live -> rememberLiveSecond(clock)
    }
    Text(
        text = SceneAudioChipClock.label(seconds.toDouble()),
        color = Color.White.copy(alpha = 0.92f),
        fontSize = fontSize,
        fontWeight = FontWeight.SemiBold,
        style = TextStyle(fontFeatureSettings = "tnum"),
        textAlign = TextAlign.End,
        maxLines = 1,
        softWrap = false,
        modifier = modifier.clearAndSetSemantics {},
    )
}

/** La seconde affichée ne change qu'une fois par seconde : seul ce texte se recompose, jamais la puce à chaque image. */
@Composable
private fun rememberPlayheadSecond(timing: SceneAudioChipTiming, clock: AudioChipClock.Playhead): Long {
    val second by remember(timing, clock) {
        derivedStateOf { timing.positionSeconds(clock.elapsedSeconds(), clock.isEditPreview).toLong() }
    }
    return second
}

@Composable
private fun rememberLiveSecond(clock: AudioChipClock.Live): Long {
    var second by remember(clock) { mutableLongStateOf(0L) }
    LaunchedEffect(clock) {
        while (isActive) {
            val read = clock.positionSeconds()
            second = if (read.isFinite() && read > 0.0) read.toLong() else 0L
            delay(LIVE_POLL_MS)
        }
    }
    return second
}

/** Ce que le lecteur d'écran dit de la puce : son nom (crédit, nom d'auteur, sinon « son sur la scène ») et sa durée. */
@Composable
internal fun audioChipSpokenLabel(chip: StoryAudioChipView): String {
    val name = chip.credit ?: chip.name ?: stringResource(R.string.story_composer_scene_voice_a11y)
    val pass = chip.timing.passSeconds ?: return name
    return stringResource(R.string.story_audio_chip_a11y, name, SceneAudioChipClock.label(pass))
}

private const val LIVE_POLL_MS = 250L
