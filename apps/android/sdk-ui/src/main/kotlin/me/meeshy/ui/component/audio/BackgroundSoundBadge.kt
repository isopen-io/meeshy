package me.meeshy.ui.component.audio

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.util.Locale
import me.meeshy.sdk.model.audio.BackgroundAudioAnnouncement
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing

/** Les mots que le badge dit à TalkBack : la nature de la piste, et l'état du son. Fournis par l'hôte (aucun libellé ici). */
public data class BackgroundSoundBadgeLabels(
    val track: String,
    val muted: String,
    val sound: String,
)

/**
 * L'annonce du son d'arrière-plan (iOS `BackgroundSoundBadge` + `BackgroundSoundMuteControl`) : la note et une mini-onde
 * pour une piste ORIGINALE ; la note et le crédit défilant pour un son de bibliothèque ; rien sans piste. La note EST le
 * contrôle du son : un toucher le coupe (la note se barre à 45°, l'onde et le crédit se figent), un second le rétablit.
 *
 * [tint] vient de l'hôte : blanc sur un média plein écran, l'accent de la surface ailleurs.
 */
@Composable
public fun BackgroundSoundBadge(
    announcement: BackgroundAudioAnnouncement,
    tint: Color,
    isMuted: Boolean,
    labels: BackgroundSoundBadgeLabels,
    onToggleMute: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (!announcement.showsMuteControl) return
    val locale: Locale = LocalConfiguration.current.locales[0]
    val spoken = BackgroundAudioAnnouncement.spokenDescription(announcement, labels.track, locale)
    val state = if (isMuted) labels.muted else labels.sound
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        modifier = modifier
            .heightIn(min = MIN_TARGET)
            .clickable(role = Role.Button, onClick = onToggleMute)
            .clearAndSetSemantics {
                contentDescription = spoken
                stateDescription = state
                role = Role.Button
            },
    ) {
        when (announcement) {
            BackgroundAudioAnnouncement.None -> Unit
            BackgroundAudioAnnouncement.Original -> {
                MutableNote(isMuted = isMuted, tint = tint, size = NOTE_SIZE)
                MiniWaveform(paused = isMuted, tint = tint)
            }
            is BackgroundAudioAnnouncement.Credit -> {
                val fontSize = BackgroundAudioAnnouncement.creditFontSizeSp(CREDIT_FONT_SP * LocalDensity.current.fontScale)
                MutableNote(isMuted = isMuted, tint = tint, size = NOTE_SIZE)
                CreditMarquee(
                    text = BackgroundAudioAnnouncement.creditText(announcement, locale),
                    tint = tint,
                    fontSize = fontSize.sp,
                    paused = isMuted,
                    modifier = Modifier.widthIn(max = CREDIT_MAX_WIDTH),
                )
            }
        }
    }
}

/** La note de musique, barrée d'une diagonale à 45° quand le son est coupé : aucun glyphe ne barre une note. */
@Composable
private fun MutableNote(isMuted: Boolean, tint: Color, size: androidx.compose.ui.unit.Dp) {
    Icon(
        imageVector = MeeshyIcons.MusicNote,
        contentDescription = null,
        tint = tint,
        modifier = Modifier
            .size(size)
            .drawWithContent {
                drawContent()
                if (isMuted) {
                    val stroke = maxOf(1.5.dp.toPx(), this.size.width * SLASH_RATIO)
                    drawLine(
                        color = tint,
                        start = Offset(0f, this.size.height),
                        end = Offset(this.size.width, 0f),
                        strokeWidth = stroke,
                        cap = StrokeCap.Round,
                    )
                }
            },
    )
}

/** Quatre barres qui respirent ; immobiles et basses quand le son est coupé ou les animations réduites. */
@Composable
private fun MiniWaveform(paused: Boolean, tint: Color) {
    val still = paused || LocalReduceMotion.current
    val transition = rememberInfiniteTransition(label = "backgroundSoundWave")
    val phases = WAVE_PERIODS_MS.mapIndexed { index, period ->
        val level by transition.animateFloat(
            initialValue = WAVE_LOW,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(tween(period, easing = LinearEasing), RepeatMode.Reverse),
            label = "bar$index",
        )
        level
    }
    Canvas(modifier = Modifier.size(width = WAVE_WIDTH, height = NOTE_SIZE)) {
        val gap = size.width / phases.size
        phases.forEachIndexed { index, level ->
            val h = size.height * if (still) WAVE_LOW else level
            val x = gap * (index + 0.5f)
            drawLine(
                color = tint,
                start = Offset(x, (size.height - h) / 2f),
                end = Offset(x, (size.height + h) / 2f),
                strokeWidth = BAR_WIDTH.toPx(),
                cap = StrokeCap.Round,
            )
        }
    }
}

private val MIN_TARGET = 48.dp
private val NOTE_SIZE = 14.dp
private val WAVE_WIDTH = 18.dp
private val BAR_WIDTH = 2.dp
private val CREDIT_MAX_WIDTH = 160.dp
private const val CREDIT_FONT_SP = 11f
private const val SLASH_RATIO = 0.14f
private const val WAVE_LOW = 0.3f
private val WAVE_PERIODS_MS = listOf(420, 560, 360, 500)
