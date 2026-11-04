package me.meeshy.ui.component.bubble

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import me.meeshy.sdk.media.MediaRequest
import me.meeshy.sdk.model.AudioPlayerChrome
import me.meeshy.sdk.model.AudioTranscriptionPending
import me.meeshy.sdk.model.AudioTranscriptionReveal
import me.meeshy.sdk.model.MediaKind
import me.meeshy.sdk.model.media.LocalFileUrl
import me.meeshy.sdk.model.media.MediaAvailabilityState
import me.meeshy.sdk.model.media.MediaPlayerContext
import me.meeshy.sdk.model.media.PlaybackSpeed
import me.meeshy.sdk.model.playback.BubbleVoiceProjection
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.component.audio.AudioPlayerActions
import me.meeshy.ui.component.audio.AudioPlayerState
import me.meeshy.ui.component.audio.AudioPlayerView
import me.meeshy.ui.component.media.rememberMediaAvailability
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.DarkMeeshyTokens
import me.meeshy.ui.theme.LocalMeeshyTokens
import me.meeshy.ui.theme.MeeshySpacing

/**
 * La posture du lecteur vocal de la rangée composée, décidée CÔTÉ APPLICATION ([me.meeshy.sdk.model.AudioPlayerChromeElection]) :
 * la ligne focale élue fournit la bande enrichie ; toute autre rangée garde la carte riche.
 */
public val LocalBubbleAudioChrome: androidx.compose.runtime.ProvidableCompositionLocal<AudioPlayerChrome> =
    staticCompositionLocalOf { AudioPlayerChrome.Card }

/**
 * **Le lecteur vocal d'une bulle** (iOS `AudioBubbleRouter` → `AudioPlayerView`) : bouton de lecture ou de téléchargement,
 * onde scrubbable (la vraie forme d'onde quand l'hôte la sert, la forme de repli déterministe sinon), écoulé / total,
 * vitesse, puis la transcription karaoké. Il ne joue rien lui-même : [playback] vient du moteur partagé, `null` tant
 * qu'une autre pièce est chargée, et chaque geste remonte par [callbacks].
 *
 * Pendant que le doigt manipule l'onde, le balayage « répondre » de la bulle est désarmé jusqu'à la levée.
 */
@Composable
public fun BubbleVoicePlayer(
    audio: BubbleAudio,
    playback: BubbleAudioPlayback?,
    onColor: Color,
    accent: Color,
    callbacks: BubbleCallbacks,
    modifier: Modifier = Modifier,
    chrome: AudioPlayerChrome = LocalBubbleAudioChrome.current,
    autoRevealTranscription: Boolean = true,
    receivedAtEpochMs: Long? = null,
) {
    val reservesTranscript = rememberTranscriptReservation(audio, receivedAtEpochMs)
    val availability = rememberVoiceAvailability(audio)
    val samplesFlow = remember(audio.attachmentId, audio.url, audio.isProtected, callbacks.audioSamples) {
        callbacks.audioSamples?.takeUnless { audio.isProtected }?.invoke(audio) ?: NO_SAMPLES
    }
    val samples by samplesFlow.collectAsState(emptyList())
    var scrubbing by remember(audio.attachmentId) { mutableStateOf(false) }
    SuppressBubbleSwipeWhile(active = scrubbing, reason = BubbleGestureReason.MediaScrubbing)
    val state = remember(audio, playback, availability.state, samples) {
        bubbleVoiceState(audio, playback, availability.state, samples)
    }
    val latestCallbacks by rememberUpdatedState(callbacks)
    val haptics = rememberMeeshyHaptics()
    val offline = BubbleVoiceProjection.isOfflineBlocked(availability.state)
    val opensFullscreen = callbacks.onAudioFullscreen != null && !audio.isProtected
    val actions = remember(audio, offline, availability, opensFullscreen) {
        AudioPlayerActions(
            onPlayPause = { if (audio.isPlayable) latestCallbacks.onAudioClick?.invoke(audio) },
            onSeek = { fraction -> latestCallbacks.onAudioSeekFraction?.invoke(audio, fraction) },
            onCycleSpeed = { latestCallbacks.onAudioCycleSpeed?.invoke() },
            onDownload = { if (!offline) availability.onDownload() },
            onRetry = { if (!offline) availability.onDownload() },
            onFullscreen = if (opensFullscreen) ({ latestCallbacks.onAudioFullscreen?.invoke(audio) }) else null,
            onScrubbingChange = { active -> scrubbing = active },
        )
    }
    val onLightInk = onColor.luminance() > INK_LUMINANCE_THRESHOLD
    val playerAccent = if (onLightInk) onColor else accent
    val content: @Composable () -> Unit = {
        AudioPlayerView(
            state = state,
            context = MediaPlayerContext.MESSAGE_BUBBLE,
            accent = playerAccent,
            actions = actions,
            chrome = chrome,
            modifier = modifier,
            bottomSlot = if (audio.hasTranscription) {
                {
                    BubbleVoiceTranscript(
                        audio = audio,
                        playback = playback,
                        onColor = onColor,
                        autoReveal = autoRevealTranscription,
                        onReveal = haptics::light,
                        onSeek = callbacks.onAudioSeek?.let { seek -> { seconds: Double -> seek(audio, seconds) } },
                    )
                }
            } else if (reservesTranscript) {
                { PendingTranscriptSkeleton() }
            } else {
                null
            },
        )
    }
    if (onLightInk) {
        CompositionLocalProvider(LocalMeeshyTokens provides DarkMeeshyTokens, content = content)
    } else {
        content()
    }
}

/** Le portrait passé au lecteur : la pièce active lit le moteur, toute autre son repos servi (position, écoutée). */
internal fun bubbleVoiceState(
    audio: BubbleAudio,
    playback: BubbleAudioPlayback?,
    availability: MediaAvailabilityState,
    samples: List<Float>,
): AudioPlayerState {
    val live = playback?.takeIf { it.attachmentId == audio.attachmentId }
    val declared = audio.declaredDurationMs
    val engineSeconds = live?.durationSeconds?.takeIf { it > 0.0 }
    return AudioPlayerState(
        isPlaying = live?.isPlaying == true,
        isLoading = live?.isLoading == true,
        liveFraction = live?.progress?.toDouble()?.coerceIn(0.0, 1.0) ?: 0.0,
        liveElapsedSeconds = live?.currentSeconds ?: 0.0,
        restingFraction = BubbleVoiceProjection.restingFraction(audio.lastPlayPositionMs, audio.listenedComplete, declared),
        resumePositionSeconds = BubbleVoiceProjection.resumeSeconds(audio.lastPlayPositionMs, audio.listenedComplete, declared),
        durationSeconds = engineSeconds ?: declared / 1000.0,
        speed = live?.speed ?: PlaybackSpeed.DEFAULT,
        availability = BubbleVoiceProjection.availability(availability),
        fileSizeBytes = (audio.sizeBytes ?: 0).toLong().coerceAtLeast(0L),
        samples = samples,
    )
}

/**
 * La disponibilité d'un vocal : taille puis anneau selon la politique du réseau, le cache qui joue hors ligne. Un vocal
 * protégé ne passe jamais par le registre de téléchargement (rien sur le disque) et un vocal local est déjà là.
 */
@Composable
private fun rememberVoiceAvailability(audio: BubbleAudio): VoiceAvailability {
    val url = audio.url
    if (url.isNullOrBlank() || audio.isProtected || LocalFileUrl.isLocal(url)) return VoiceAvailability.Ready
    val request = remember(url, audio.sizeBytes, audio.isAudioTranslated) {
        MediaRequest(
            url = url,
            kind = if (audio.isAudioTranslated) MediaKind.AUDIO_TRANSLATION else MediaKind.AUDIO,
            expectedSizeBytes = (audio.sizeBytes ?: 0).toLong().coerceAtLeast(0L),
        )
    }
    val handle = rememberMediaAvailability(request)
    return remember(handle) { VoiceAvailability(handle.state, handle.onDownload) }
}

private class VoiceAvailability(val state: MediaAvailabilityState, val onDownload: () -> Unit) {
    companion object {
        val Ready = VoiceAvailability(MediaAvailabilityState.Ready) {}
    }
}

/**
 * La transcription sous le lecteur (iOS `AudioPlayerView.transcriptionBlock`) : révélée d'office pour ses propres
 * messages, derrière « Transcrire » sinon ; le karaoké allume le segment dit et un mot touché y place la lecture.
 */
@Composable
private fun BubbleVoiceTranscript(
    audio: BubbleAudio,
    playback: BubbleAudioPlayback?,
    onColor: Color,
    autoReveal: Boolean,
    onReveal: () -> Unit,
    onSeek: ((Double) -> Unit)?,
) {
    val segments = remember(audio) { audio.karaokeSegments }
    val live = playback?.takeIf { it.attachmentId == audio.attachmentId }
    val frame = BubbleAudioKaraoke.frame(segments, live)
    var revealed by remember(audio.attachmentId) { mutableStateOf(false) }
    val showCta = AudioTranscriptionReveal.shouldShowRevealCta(
        hasTranscription = true,
        autoReveal = autoReveal,
        manuallyRevealed = revealed,
    )
    AnimatedContent(
        targetState = showCta,
        transitionSpec = { fadeIn(tween(TRANSCRIPT_FADE_MILLIS)) togetherWith fadeOut(tween(TRANSCRIPT_FADE_MILLIS)) },
        label = "bubbleVoiceTranscriptReveal",
        modifier = Modifier.padding(horizontal = MeeshySpacing.smPlus).padding(bottom = MeeshySpacing.xs),
    ) { cta ->
        if (cta) {
            RevealTranscriptionCta(
                onColor = onColor,
                onReveal = {
                    onReveal()
                    revealed = true
                },
            )
        } else {
            KaraokeTranscript(
                segments = segments,
                frame = frame,
                onColor = onColor,
                onSeek = onSeek?.takeIf { live != null },
            )
        }
    }
}

/**
 * La place de la transcription attendue ([AudioTranscriptionPending]) : vraie au premier rendu d'un vocal reçu depuis
 * moins de 90 s, elle tombe d'elle-même à la fin de la fenêtre — jamais un squelette éternel.
 */
@Composable
private fun rememberTranscriptReservation(audio: BubbleAudio, receivedAtEpochMs: Long?): Boolean {
    val isLocalDraft = audio.url?.let(LocalFileUrl::isLocal) == true
    val openedAt = remember(audio.attachmentId) { System.currentTimeMillis() }
    val reserved = AudioTranscriptionPending.shouldReserveHeight(audio.hasTranscription, receivedAtEpochMs, openedAt, isLocalDraft)
    var expired by remember(audio.attachmentId) { mutableStateOf(false) }
    if (reserved && receivedAtEpochMs != null) {
        LaunchedEffect(audio.attachmentId, receivedAtEpochMs) {
            delay((receivedAtEpochMs + AudioTranscriptionPending.NOMINAL_TIMEOUT_MS - openedAt).coerceAtLeast(0L))
            expired = true
        }
    }
    return reserved && !expired
}

/** Trois lignes qui pulsent à la place de la transcription attendue (iOS `transcriptionBlock`, squelette). */
@Composable
private fun PendingTranscriptSkeleton() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.smPlus)
            .padding(bottom = MeeshySpacing.xs)
            .clearAndSetSemantics {},
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        PENDING_LINE_FRACTIONS.forEach { fraction ->
            MeeshySkeletonBox(modifier = Modifier.fillMaxWidth(fraction).height(PendingLineHeight))
        }
    }
}

private val PENDING_LINE_FRACTIONS = listOf(1f, 0.85f, 0.6f)
private val PendingLineHeight = 10.dp

private val NO_SAMPLES: Flow<List<Float>> = flowOf(emptyList())

private const val INK_LUMINANCE_THRESHOLD = 0.5f
