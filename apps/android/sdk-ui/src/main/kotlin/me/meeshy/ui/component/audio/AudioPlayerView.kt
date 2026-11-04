package me.meeshy.ui.component.audio

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.AudioPlayerChrome
import me.meeshy.sdk.model.AudioPlayerChromePlan
import me.meeshy.sdk.model.media.AudioAvailability
import me.meeshy.sdk.model.media.MediaPlayerContext
import me.meeshy.sdk.model.media.PlaybackSpeed
import me.meeshy.sdk.model.media.formatMediaDuration
import me.meeshy.sdk.model.playback.AudioLanguageStripLaw
import me.meeshy.sdk.model.waveform.AudioProgressDisplay
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.meeshyTapTarget
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.boundedScale

/**
 * État hissé du lecteur vocal — des valeurs, jamais un flux : l'appelant (la bulle, le composeur,
 * la story) résout le moteur, la persistance de consommation, le Prisme de la piste et la
 * disponibilité, puis remet ce portrait. Miroir de ce que `AudioPlayerView` d'iOS lit sur son moteur.
 */
@Immutable
public data class AudioPlayerState(
    val isPlaying: Boolean = false,
    val isLoading: Boolean = false,
    val liveFraction: Double = 0.0,
    val liveElapsedSeconds: Double = 0.0,
    /** Fraction consommée persistée, montrée au repos. */
    val restingFraction: Double = 0.0,
    val resumePositionSeconds: Double? = null,
    val durationSeconds: Double = 0.0,
    val speed: PlaybackSpeed = PlaybackSpeed.DEFAULT,
    val availability: AudioAvailability = AudioAvailability.Ready,
    val fileSizeBytes: Long = 0L,
    val samples: List<Float> = emptyList(),
    val hasError: Boolean = false,
) {
    val display: AudioProgressDisplay
        get() = AudioProgressDisplay.of(liveFraction, liveElapsedSeconds, restingFraction, resumePositionSeconds, durationSeconds)
}

/** Callbacks du lecteur, regroupés pour ne pas multiplier les paramètres. */
public class AudioPlayerActions(
    public val onPlayPause: () -> Unit,
    public val onSeek: (Double) -> Unit,
    public val onCycleSpeed: () -> Unit,
    public val onDownload: () -> Unit = {},
    public val onRetry: () -> Unit = {},
    public val onFullscreen: (() -> Unit)? = null,
    public val onEdit: (() -> Unit)? = null,
    public val onDelete: (() -> Unit)? = null,
    public val onScrubbingChange: (Boolean) -> Unit = {},
)

/**
 * Lecteur vocal : bouton rond, onde scrubbable, timecodes, puces vitesse/pourcentage, états de
 * disponibilité. [chrome] suit [AudioPlayerChromePlan] ; [context] fixe l'échelle et le rayon.
 * L'accent est celui de la conversation, passé en paramètre.
 */
@Composable
public fun AudioPlayerView(
    state: AudioPlayerState,
    context: MediaPlayerContext,
    accent: Color,
    actions: AudioPlayerActions,
    modifier: Modifier = Modifier,
    chrome: AudioPlayerChrome = AudioPlayerChrome.Card,
    topSlot: (@Composable () -> Unit)? = null,
    bottomSlot: (@Composable () -> Unit)? = null,
    /**
     * Le bandeau de langues (Original + pistes traduites). Il ne se montre que si la posture le permet, hors contexte
     * compact (la bulle, dont le pied porte déjà les drapeaux) et avec au moins une piste traduite ([AudioLanguageStripLaw]).
     */
    languageStrip: AudioLanguageStripSpec? = null,
) {
    val plan = remember(chrome) { AudioPlayerChromePlan.plan(chrome) }
    val isDark = MeeshyTheme.isDark || context.isImmersive
    val compact = context.isCompact
    val shape = RoundedCornerShape(context.cornerRadiusDp.dp)
    val card = if (plan.showsCardBackground) {
        Modifier
            .background(if (isDark) Color.White.copy(alpha = 0.05f) else Color.Black.copy(alpha = 0.03f), shape)
            .border(BorderStroke(0.5.dp, if (isDark) Color.White.copy(alpha = 0.08f) else Color.Black.copy(alpha = 0.05f)), shape)
    } else Modifier
    Column(modifier.then(card)) {
        topSlot?.invoke()
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(
                    horizontal = if (plan.showsCardBackground) (if (compact) 10.dp else 14.dp) else 0.dp,
                    vertical = if (plan.showsCardBackground) (if (compact) 8.dp else 12.dp) else 6.dp,
                ),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(if (compact) 8.dp else 10.dp),
        ) {
            AudioPlayerButton(
                availability = state.availability,
                isPlaying = state.isPlaying,
                isLoading = state.isLoading,
                isCompact = compact,
                isDark = isDark,
                accent = accent,
                fileSizeBytes = state.fileSizeBytes,
                onPlayPause = actions.onPlayPause,
                onDownload = actions.onDownload,
            )
            PlayerBody(state, compact, isDark, accent, actions, Modifier.weight(1f))
            if (plan.showsRightChips) {
                AudioPlayerChipsColumn(
                    speed = state.speed,
                    progressFraction = state.display.fraction,
                    isCompact = compact,
                    isDark = isDark,
                    accent = accent,
                    onCycleSpeed = actions.onCycleSpeed,
                    onFullscreen = actions.onFullscreen,
                )
            }
            if (context.isEditable) ComposerActions(actions, isDark)
        }
        bottomSlot?.invoke()
        if (languageStrip != null && AudioLanguageStripLaw.isShown(chrome, context, translatedCount = languageStrip.pills.size - 1)) {
            AudioLanguageStrip(
                pills = languageStrip.pills,
                accent = accent,
                isDark = isDark,
                onSelect = languageStrip.onSelect,
                modifier = Modifier.padding(top = MeeshySpacing.xsPlus),
            )
        }
    }
}

@Composable
private fun PlayerBody(
    state: AudioPlayerState,
    compact: Boolean,
    isDark: Boolean,
    accent: Color,
    actions: AudioPlayerActions,
    modifier: Modifier,
) {
    val display = state.display
    Column(modifier, verticalArrangement = Arrangement.spacedBy(if (compact) 3.dp else 4.dp)) {
        AudioPlayerWaveform(
            samples = state.samples,
            display = display,
            isCompact = compact,
            isDark = isDark,
            accent = accent,
            enabled = state.availability == AudioAvailability.Ready,
            onSeek = actions.onSeek,
            onScrubbingChange = actions.onScrubbingChange,
        )
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Timecode(formatMediaDuration(display.elapsedSeconds).orEmpty(), compact, if (isDark) 0.5f else 0.4f, isDark)
            Timecode(formatMediaDuration(state.durationSeconds).orEmpty(), compact, if (isDark) 0.3f else 0.25f, isDark)
        }
        if (state.hasError) AudioPlayerErrorRow(actions.onRetry)
    }
}

@Composable
private fun Timecode(text: String, compact: Boolean, alpha: Float, isDark: Boolean) {
    Text(
        text = text,
        fontFamily = FontFamily.Monospace,
        fontWeight = FontWeight.SemiBold,
        fontSize = (if (compact) 9 else 10).sp.boundedScale(),
        color = (if (isDark) Color.White else Color.Black).copy(alpha = alpha),
        maxLines = 1,
    )
}

@Composable
private fun ComposerActions(actions: AudioPlayerActions, isDark: Boolean) {
    val haptics = rememberMeeshyHaptics()
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
        actions.onEdit?.let { edit ->
            Icon(
                imageVector = MeeshyIcons.Edit,
                contentDescription = stringResource(R.string.audio_player_edit),
                tint = (if (isDark) Color.White else Color.Black).copy(alpha = if (isDark) 0.45f else 0.35f),
                modifier = Modifier
                    .semantics { role = Role.Button }
                    .clickable { haptics.light(); edit() }
                    .meeshyTapTarget()
                    .size(18.dp),
            )
        }
        actions.onDelete?.let { delete ->
            Icon(
                imageVector = MeeshyIcons.CloseCircleFilled,
                contentDescription = stringResource(R.string.audio_player_delete),
                tint = MeeshyPalette.Error,
                modifier = Modifier
                    .semantics { role = Role.Button }
                    .clickable { haptics.light(); delete() }
                    .meeshyTapTarget()
                    .size(20.dp),
            )
        }
    }
}
