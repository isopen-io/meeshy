package me.meeshy.ui.component.kit

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.coerceAtLeast
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.accessibility.decorative
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

private const val PLAYED_RESTING_ALPHA = 0.6f

/**
 * **Le lecteur d'onde** (K35) : le disque lire/pause/rejouer, l'onde de barres qui se scrubbe, la durée. Il remplace les
 * lecteurs jumeaux des vocaux, de l'échantillon de voix et des sons de story : UNE loi des barres ([MeeshyWaveBarsLaw] — une
 * barre tous les 6 dp, jamais sous 3 de haut), UNE loi du glissement ([MeeshyWaveScrubLaw]).
 *
 * Il ne sait rien d'un message : l'hôte remet [samples] (vides ⇒ barres plates, jamais une onde inventée), [progress] de 0 à 1,
 * [isPlaying] et la [phase] (`Buffering` ⇒ anneau, `Unavailable` ⇒ 40 %). Le glissement suit le doigt, prioritaire sur le
 * défilement parent, et se ferme toujours — même si le lecteur cesse d'accepter le geste ou si le geste est annulé. À TalkBack
 * l'onde est une valeur réglable (« 0:05 sur 0:09 ») et le disque un bouton nommé. Jumeau iOS : `MeeshyWavePlayer`.
 */
@Composable
@Suppress("LongParameterList", "LongMethod")
public fun MeeshyWavePlayer(
    samples: List<Float>,
    progress: Double,
    isPlaying: Boolean,
    label: String,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
    durationSeconds: Double = 0.0,
    size: MeeshyWavePlayerSize = MeeshyWavePlayerSize.Row,
    phase: MeeshyWavePlayerPhase = MeeshyWavePlayerPhase.Ready,
    clock: MeeshyWavePlayerClock = MeeshyWavePlayerClock.Remaining,
    tint: Color? = null,
    enabled: Boolean = true,
    onSeek: ((Double) -> Unit)? = null,
    onScrubbingChange: ((Boolean) -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    val reduce = LocalReduceMotion.current
    var scrubFraction by remember { mutableStateOf<Double?>(null) }
    val values = MeeshyWavePlayerRecipe.resolve(size, phase, isPlaying, progress, scrubFraction != null, enabled, reduce)
    val accent = tint ?: MeeshyPalette.Indigo500
    val shown = MeeshyWaveBarsLaw.displayedProgress(progress, scrubFraction)
    val clockText = MeeshyWavePlayerRecipe.clockText(durationSeconds, shown, isPlaying, clock)
    Row(
        modifier = modifier.fillMaxWidth().height(values.rowHeightDp.dp).alpha(values.opacity),
        horizontalArrangement = Arrangement.spacedBy(values.gapDp.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        WaveDisc(values, accent, label, isPlaying, enabled, onToggle)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            WaveBars(
                samples, shown, values, accent, durationSeconds, label,
                onFraction = { scrubFraction = it },
                onSeek = onSeek, onScrubbingChange = onScrubbingChange,
            )
            Text(
                clockText, color = MeeshyTheme.tokens.textSecondary, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                style = TextStyle(fontFeatureSettings = "tnum"), modifier = Modifier.decorative(),
            )
        }
        trailing?.invoke()
    }
}

@Composable
private fun WaveDisc(values: MeeshyWavePlayerValues, accent: Color, label: String, isPlaying: Boolean, enabled: Boolean, onToggle: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale = if (pressed && values.acceptsToggle) values.pressedScale else 1f
    val verb = stringResource(if (isPlaying) R.string.kit_wave_player_pause else R.string.kit_wave_player_play)
    val stateWord = when (values.phaseState) {
        MeeshyWavePlayerState.Buffering -> stringResource(R.string.kit_wave_player_buffering)
        MeeshyWavePlayerState.Unavailable -> stringResource(R.string.kit_wave_player_unavailable)
        MeeshyWavePlayerState.Finished -> stringResource(R.string.kit_wave_player_replay)
        else -> null
    }
    val glyph = when (values.glyph) {
        MeeshyWavePlayerGlyph.Play -> MeeshyIcons.Play
        MeeshyWavePlayerGlyph.Pause -> MeeshyIcons.Pause
        MeeshyWavePlayerGlyph.Replay -> MeeshyIcons.Replay
    }
    Box(
        modifier = Modifier
            .size(values.discDiameterDp.dp)
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .clip(CircleShape)
            .background(accent)
            .semantics {
                contentDescription = "$verb, $label"
                if (stateWord != null) stateDescription = stateWord
                role = Role.Button
                if (!values.acceptsToggle || !enabled) disabled()
            }
            .clickable(interactionSource = interaction, indication = null, enabled = values.acceptsToggle, role = Role.Button, onClick = onToggle),
        contentAlignment = Alignment.Center,
    ) {
        Icon(glyph, contentDescription = null, tint = Color(0xFF0B0B12), modifier = Modifier.size(values.glyphSizeDp.dp))
        if (values.showsRing) {
            CircularProgressIndicator(modifier = Modifier.size(values.discDiameterDp.dp), color = Color(0xFF0B0B12), strokeWidth = 2.dp)
        }
    }
}

@Composable
@Suppress("LongParameterList", "LongMethod")
private fun WaveBars(
    samples: List<Float>,
    shown: Double,
    values: MeeshyWavePlayerValues,
    accent: Color,
    durationSeconds: Double,
    label: String,
    onFraction: (Double?) -> Unit,
    onSeek: ((Double) -> Unit)?,
    onScrubbingChange: ((Boolean) -> Unit)?,
) {
    val isRtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    val currentValues = rememberUpdatedState(values)
    val currentSeek = rememberUpdatedState(onSeek)
    val currentScrub = rememberUpdatedState(onScrubbingChange)
    val currentFraction = rememberUpdatedState(onFraction)
    val currentRtl = rememberUpdatedState(isRtl)
    val total = MeeshyWavePlayerRecipe.clockText(durationSeconds, 0.0, false, MeeshyWavePlayerClock.Total)
    val elapsed = MeeshyWavePlayerRecipe.clockText(durationSeconds, shown, true, MeeshyWavePlayerClock.Elapsed)
    val position = stringResource(R.string.kit_wave_player_position, elapsed, total)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(values.waveHeightDp.dp.coerceAtLeast(values.scrubZoneHeightDp.dp))
            .semantics {
                contentDescription = label
                stateDescription = position
                progressBarRangeInfo = ProgressBarRangeInfo(shown.toFloat(), 0f..1f)
                setProgress { target ->
                    val seek = currentSeek.value
                    if (seek == null || !currentValues.value.acceptsScrub) {
                        false
                    } else {
                        seek(target.toDouble().coerceIn(0.0, 1.0))
                        true
                    }
                }
            }
            .pointerInput(values.acceptsScrub) {
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    if (!currentValues.value.acceptsScrub || currentSeek.value == null) return@awaitEachGesture
                    val widthDp = size.width / density
                    fun fraction(x: Float) = MeeshyWaveBarsLaw.scrubFraction(x / density, widthDp, currentRtl.value)
                    down.consume()
                    var law = MeeshyWaveScrubLaw()
                    try {
                        var last = fraction(down.position.x)
                        law.move(last).let { law = it.law; if (it.began) currentScrub.value?.invoke(true) }
                        currentFraction.value(last)
                        while (true) {
                            val event = awaitPointerEvent(PointerEventPass.Main)
                            val change = event.changes.firstOrNull { it.id == down.id } ?: break
                            last = fraction(change.position.x)
                            change.consume()
                            if (!change.pressed) {
                                val end = law.finish(last, accepts = currentValues.value.acceptsScrub)
                                law = end.law
                                end.commit?.let { currentSeek.value?.invoke(it) }
                                if (end.ended) currentScrub.value?.invoke(false)
                                currentFraction.value(null)
                                break
                            }
                            law.move(last).let { law = it.law }
                            currentFraction.value(last)
                        }
                    } finally {
                        val closed = law.cancel()
                        if (closed.ended) {
                            currentScrub.value?.invoke(false)
                            currentFraction.value(null)
                        }
                    }
                }
            },
    ) {
        val scrubScale = if (values.phaseState == MeeshyWavePlayerState.Scrubbing) values.scrubScale else 1f
        Canvas(
            Modifier
                .fillMaxWidth()
                .height(values.waveHeightDp.dp)
                .align(Alignment.Center)
                .graphicsLayer { scaleY = scrubScale }
                .decorative(),
        ) {
            val widthDp = size.width / density
            val bars = MeeshyWaveBarsLaw.resample(samples, widthDp)
            val filled = MeeshyWaveBarsLaw.filledBars(bars.size, shown)
            val slot = size.width / bars.size
            val barWidth = MeeshyWaveBarsLaw.BAR_WIDTH_DP * density
            val atRest = values.phaseState == MeeshyWavePlayerState.Rest
            bars.forEachIndexed { index, level ->
                val height = MeeshyWaveBarsLaw.height(level, values.waveHeightDp) * density
                val played = index < filled
                val color = when {
                    atRest -> accent
                    played && values.barsAreLive -> accent
                    played -> accent.copy(alpha = PLAYED_RESTING_ALPHA)
                    else -> accent.copy(alpha = values.upcomingOpacity)
                }
                val x = (if (isRtl) bars.size - 1 - index else index) * slot + (slot - barWidth) / 2f
                drawRoundRect(color, Offset(x, (size.height - height) / 2f), Size(barWidth, height), CornerRadius(barWidth / 2f))
            }
        }
    }
}
