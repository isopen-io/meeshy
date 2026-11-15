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
import androidx.compose.runtime.State
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flowOf
import me.meeshy.sdk.media.MediaRequest
import me.meeshy.sdk.model.AudioPlayerChrome
import me.meeshy.sdk.model.AudioPlayerChromePlan
import me.meeshy.sdk.model.AudioTranscriptionPending
import me.meeshy.sdk.model.AudioTranscriptionBlock
import me.meeshy.sdk.model.AudioTranscriptionReveal
import me.meeshy.sdk.model.MediaKind
import me.meeshy.sdk.model.ServerTranscriptionWait
import me.meeshy.sdk.model.MessageTranscriptionFiche
import me.meeshy.sdk.model.media.LocalFileUrl
import me.meeshy.sdk.model.media.MediaAvailabilityState
import me.meeshy.sdk.model.media.MediaPlayerContext
import me.meeshy.sdk.model.media.PlaybackSpeed
import me.meeshy.sdk.model.playback.BubbleVoiceProjection
import me.meeshy.ui.R
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.component.audio.AudioPlayerActions
import me.meeshy.ui.component.audio.AudioPlayerState
import me.meeshy.ui.component.audio.AudioPlayerView
import me.meeshy.ui.component.audio.AudioTranscriptionSlot
import me.meeshy.ui.component.audio.AudioTranscriptionText
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
    val request by rememberTranscriptionRequest(audio, callbacks)
    val block = AudioTranscriptionBlock.of(
        hasTranscription = audio.hasTranscription,
        reservedPassively = reservesTranscript,
        request = request,
        canRequest = callbacks.onRequestTranscription != null && AudioPlayerChromePlan.plan(chrome).showsTranscribeCta && !audio.isProtected && audio.url?.let(LocalFileUrl::isLocal) != true,
    )
    val availability = rememberVoiceAvailability(audio)
    val measures = BubbleVoiceProjection.measuresWaveform(availability.state, audio.isProtected)
    val samplesFlow = remember(audio.attachmentId, audio.url, measures, callbacks.audioSamples) {
        callbacks.audioSamples?.takeIf { measures }?.invoke(audio) ?: NO_SAMPLES
    }
    val samples by samplesFlow.collectAsState()
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
            bottomSlot = if (block == AudioTranscriptionBlock.Kind.NONE) null else ({
                AudioTranscriptionSlot(
                    kind = block,
                    skeleton = { PendingTranscriptSkeleton(inFlight = request == MessageTranscriptionFiche.Request.IN_FLIGHT) },
                    request = {
                        RevealTranscriptionCta(
                            onColor = onColor,
                            onReveal = {
                                haptics.light()
                                latestCallbacks.onRequestTranscription?.invoke(audio)
                            },
                        )
                    },
                    transcript = {
                        BubbleVoiceTranscript(
                            audio = audio,
                            playback = playback,
                            chrome = chrome,
                            onColor = onColor,
                            accent = playerAccent,
                            autoReveal = autoRevealTranscription,
                            onReveal = haptics::light,
                            onSeek = callbacks.onAudioSeek?.let { seek -> { seconds: Double -> seek(audio, seconds) } },
                            onFullscreen = if (opensFullscreen) ({ latestCallbacks.onAudioFullscreen?.invoke(audio) }) else null,
                            onRetranscribe = callbacks.onRetranscribe
                                ?.takeIf { AudioPlayerChromePlan.plan(chrome).showsRetranscribe && !audio.isProtected && audio.url?.let(LocalFileUrl::isLocal) != true }
                                ?.let { retranscribe -> { haptics.light(); retranscribe(audio) } },
                        )
                    },
                )
            }),
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
    chrome: AudioPlayerChrome,
    onColor: Color,
    accent: Color,
    autoReveal: Boolean,
    onReveal: () -> Unit,
    onSeek: ((Double) -> Unit)?,
    onFullscreen: (() -> Unit)?,
    onRetranscribe: (() -> Unit)? = null,
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
            Column {
                val seek = onSeek?.takeIf { live != null }
                AudioTranscriptionText(
                    segments = segments,
                    chrome = chrome,
                    activeIndex = frame.activeIndex,
                    ink = onColor,
                    accent = accent,
                    onSeek = seek,
                    onFullscreen = onFullscreen,
                ) { shown, expanded ->
                    KaraokeTranscript(
                        segments = shown,
                        frame = frame,
                        onColor = onColor,
                        onSeek = seek,
                        maxLines = if (expanded) Int.MAX_VALUE else CARD_COLLAPSED_LINES,
                    )
                }
                if (onRetranscribe != null) {
                    // En attente de la nouvelle transcription : le bouton se grise jusqu'à ce que le texte change.
                    var asked by remember(audio.attachmentId, audio.transcriptionText) { mutableStateOf(false) }
                    LaunchedEffect(asked) {
                        if (asked) {
                            delay(ServerTranscriptionWait.SILENCE_CEILING_MS)
                            asked = false
                        }
                    }
                    RetranscribeButton(onColor = onColor, enabled = !asked, onClick = { asked = true; onRetranscribe() })
                }
            }
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

/**
 * L'état de la demande de transcription de [audio] (l'hôte le tient) : au repos tant qu'il n'en dit rien. Aucune
 * souscription pour un vocal protégé (la demande ne lui est jamais offerte) ni pour un vocal déjà transcrit (le texte
 * l'emporte sur tout état de demande) : un fil de vocaux transcrits ne tient aucun collecteur.
 */
@Composable
private fun rememberTranscriptionRequest(audio: BubbleAudio, callbacks: BubbleCallbacks): State<MessageTranscriptionFiche.Request> {
    val subscribes = !audio.isProtected && !audio.hasTranscription
    val flow = remember(audio.attachmentId, subscribes, callbacks.transcriptionRequest) {
        callbacks.transcriptionRequest?.takeIf { subscribes }?.invoke(audio) ?: flowOf(MessageTranscriptionFiche.Request.IDLE)
    }
    return flow.collectAsState(initial = MessageTranscriptionFiche.Request.IDLE)
}

/**
 * Trois lignes qui pulsent à la place de la transcription attendue (iOS `transcriptionBlock`, squelette). Quand une
 * demande tourne ([inFlight]) le lecteur d'écran annonce « Transcription en cours » ; l'attente passive reste muette.
 */
@Composable
private fun PendingTranscriptSkeleton(inFlight: Boolean = false) {
    val label = if (inFlight) stringResource(R.string.media_audio_transcribing) else null
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.smPlus)
            .padding(bottom = MeeshySpacing.xs)
            .clearAndSetSemantics { label?.let { contentDescription = it } },
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        PENDING_LINE_FRACTIONS.forEach { fraction ->
            MeeshySkeletonBox(modifier = Modifier.fillMaxWidth(fraction).height(PendingLineHeight))
        }
    }
}

private val PENDING_LINE_FRACTIONS = listOf(1f, 0.85f, 0.6f)
private val PendingLineHeight = 10.dp

private val NO_SAMPLES: StateFlow<List<Float>> = MutableStateFlow(emptyList<Float>()).asStateFlow()

private const val INK_LUMINANCE_THRESHOLD = 0.5f
private const val CARD_COLLAPSED_LINES = 6
