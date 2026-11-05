package me.meeshy.ui.component.audio

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import me.meeshy.sdk.model.MessageTranscriptionFiche
import me.meeshy.sdk.model.fullscreen.AudioFullscreenTranscriptLaw
import me.meeshy.sdk.model.fullscreen.AudioFullscreenTranscriptLaw.Haptic
import me.meeshy.sdk.model.fullscreen.AudioFullscreenTranscriptLaw.Kind
import me.meeshy.sdk.model.playback.AudioPlaybackState
import me.meeshy.ui.R
import me.meeshy.ui.component.fullscreen.FullscreenChromeDimens
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyAdaptiveColors
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Les étiquettes de test de la zone des paroles : l'état vide et son action « Transcrire ». */
public const val AUDIO_FULLSCREEN_TRANSCRIPT_EMPTY_TAG: String = "audioFullscreenTranscriptEmpty"
public const val AUDIO_FULLSCREEN_TRANSCRIBE_TAG: String = "audioFullscreenTranscribe"

/** Comment les paroles se posent : plein cadre sous l'en-tête (empilé), ou en carte à côté du cadran (côte à côte, mode lecture). */
internal enum class LyricsMode { LYRICS, READING }

/** La mise en page d'une zone de paroles : la marge réservée dans le défilement, l'ancre du mot dit, la taille et la hauteur de la carte. */
internal data class LyricsPlacement(
    val mode: LyricsMode,
    val fontSize: TextUnit,
    val contentPadding: PaddingValues = PaddingValues(),
    val anchor: Float = 0.5f,
    val maxHeight: Float = 200f,
)

/**
 * **Ce que le vocal DIT, en plein écran** (iOS `transcriptBlock`) : la transcription servie — celle du serveur, sinon celle
 * faite sur l'appareil — allumée mot à mot pendant que SA piste joue ; vide, une capsule « Transcrire » (toucher : sur
 * l'appareil, appui long : le choix appareil ou serveur) ; en cours, la même capsule avec sa roue, désactivée. Un hôte sans
 * [transcripts] ne montre que la transcription déjà servie — jamais un bouton qui ne fait rien. Une issue vibre (succès à
 * l'arrivée du texte, erreur à l'échec) selon [AudioFullscreenTranscriptLaw.outcome].
 */
@Composable
internal fun AudioFullscreenLyrics(
    source: AudioFullscreenSource,
    playback: AudioPlaybackState,
    transcripts: AudioFullscreenTranscriptPort?,
    accent: Color,
    placement: LyricsPlacement,
    modifier: Modifier = Modifier,
    onSeek: (Double) -> Unit,
) {
    val canTranscribe = transcripts?.offersTranscription(source) == true
    val tracked by remember(transcripts, source.id) { transcripts?.transcript(source) ?: IdleTranscript }.collectAsState()
    val served = remember(source.transcriptionSegments, source.transcriptionText, tracked.localSegments, tracked.localText, source.durationMs) {
        AudioFullscreenTranscriptLaw.served(source.transcriptionSegments, source.transcriptionText, tracked.localSegments, tracked.localText, source.durationMs)
    }
    val kind = AudioFullscreenTranscriptLaw.state(hasServed = served != null, request = tracked.request)
    TranscriptOutcomeHaptics(kind, tracked.request)
    when {
        served != null -> {
            val loaded = playback.attachmentId == source.id
            MediaTranscriptionView(
                segments = served.segments,
                currentSeconds = if (loaded) playback.currentTimeMs / MS_PER_SECOND else 0.0,
                isPlaying = loaded && playback.isPlaying,
                progress = if (loaded) playback.progress else 0.0,
                accent = accent,
                ink = MeeshyTheme.tokens.textPrimary,
                modifier = modifier,
                fontSize = placement.fontSize,
                maxHeight = placement.maxHeight,
                showsBackground = placement.mode == LyricsMode.READING,
                onSeek = onSeek,
                contentPadding = placement.contentPadding,
                anchor = placement.anchor,
                fillHeight = placement.mode == LyricsMode.LYRICS,
            )
        }
        canTranscribe -> Box(modifier.padding(placement.contentPadding).padding(horizontal = MeeshySpacing.md)) {
            AudioFullscreenTranscriptEmpty(
                kind = kind,
                accent = accent,
                onDevice = { transcripts?.transcribeOnDevice(source) },
                onServer = { transcripts?.transcribeOnServer(source) },
            )
        }
    }
}

/** La vibration d'une issue de transcription : posée à la TRANSITION, jamais à l'ouverture d'une page déjà dans son état. */
@Composable
private fun TranscriptOutcomeHaptics(kind: Kind, request: MessageTranscriptionFiche.Request) {
    val haptics = rememberMeeshyHaptics()
    var previous by remember { mutableStateOf(kind) }
    LaunchedEffect(kind, request) {
        when (AudioFullscreenTranscriptLaw.outcome(previous, kind, request)) {
            Haptic.SUCCESS -> haptics.success()
            Haptic.ERROR -> haptics.error()
            null -> Unit
        }
        previous = kind
    }
}

/**
 * L'état vide (iOS `transcriptionEmptyState`) : « Aucune transcription » et la capsule d'action. Toucher transcrit sur
 * l'appareil (instantané, sans réseau) ; l'appui long ouvre le menu qui offre aussi le serveur (segments horodatés, locuteurs).
 * Aux lecteurs d'écran les deux choix sont des actions personnalisées : l'appui long n'est pas un geste de TalkBack.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun AudioFullscreenTranscriptEmpty(kind: Kind, accent: Color, onDevice: () -> Unit, onServer: () -> Unit) {
    val isDark = MeeshyTheme.isDark
    val running = kind == Kind.IN_FLIGHT
    var menuOpen by remember { mutableStateOf(false) }
    val haptics = rememberMeeshyHaptics()
    val localLabel = stringResource(R.string.audio_fullscreen_transcription_local)
    val serverLabel = stringResource(R.string.audio_fullscreen_transcription_server)
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.lg))
            .background(MeeshyAdaptiveColors.surfaceFill(isDark))
            .padding(vertical = MeeshySpacing.md)
            .semantics { testTag = AUDIO_FULLSCREEN_TRANSCRIPT_EMPTY_TAG },
    ) {
        Text(
            text = stringResource(R.string.audio_fullscreen_transcription_empty),
            style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Medium),
            color = MeeshyTheme.tokens.textMuted,
        )
        Box {
            Row(
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .defaultMinSize(minHeight = FullscreenChromeDimens.tapTarget)
                    .clip(CircleShape)
                    .background(accent)
                    .combinedClickable(
                        enabled = !running,
                        role = Role.Button,
                        onClickLabel = localLabel,
                        onLongClickLabel = stringResource(R.string.audio_fullscreen_transcription_choose_hint),
                        onLongClick = {
                            haptics.light()
                            menuOpen = true
                        },
                        onClick = {
                            haptics.light()
                            onDevice()
                        },
                    )
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.smPlus)
                    .semantics {
                        testTag = AUDIO_FULLSCREEN_TRANSCRIBE_TAG
                        if (running) disabled()
                        customActions = listOf(
                            CustomAccessibilityAction(localLabel) { onDevice(); true },
                            CustomAccessibilityAction(serverLabel) { onServer(); true },
                        )
                    },
            ) {
                if (running) {
                    CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp, color = Color.White)
                } else {
                    Icon(MeeshyIcons.WaveformMic, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp))
                }
                Text(
                    text = stringResource(R.string.audio_fullscreen_transcription_action),
                    style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                    color = Color.White,
                )
            }
            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                DropdownMenuItem(
                    text = { Text(localLabel) },
                    leadingIcon = { Icon(MeeshyIcons.Smartphone, contentDescription = null) },
                    onClick = {
                        menuOpen = false
                        onDevice()
                    },
                )
                DropdownMenuItem(
                    text = { Text(serverLabel) },
                    leadingIcon = { Icon(MeeshyIcons.Cloud, contentDescription = null) },
                    onClick = {
                        menuOpen = false
                        onServer()
                    },
                )
            }
        }
    }
}

private val IdleTranscript: StateFlow<AudioFullscreenTranscriptState> = MutableStateFlow(AudioFullscreenTranscriptState.Idle)

private const val MS_PER_SECOND = 1000.0
