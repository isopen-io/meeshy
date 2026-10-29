package me.meeshy.app.chat

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import java.time.ZoneId
import java.util.Locale
import kotlinx.coroutines.delay
import me.meeshy.sdk.model.playback.ContentPlaybackSessionLaw
import me.meeshy.sdk.model.playback.InterruptionResumeLedger
import me.meeshy.sdk.model.playback.MediaSessionEvent
import me.meeshy.sdk.model.playback.VoicePlaybackCard
import me.meeshy.sdk.model.playback.VoicePlaybackCardRules
import me.meeshy.sdk.model.playback.VoicePlaybackCommand
import me.meeshy.sdk.model.playback.VoicePlaybackTransportState
import me.meeshy.ui.component.audio.LocalVoicePlaybackHost
import me.meeshy.ui.component.audio.NoVoicePlaybackHost
import me.meeshy.ui.component.audio.VoicePlaybackHost
import me.meeshy.ui.component.bubble.BubbleAudio
import me.meeshy.ui.component.bubble.BubbleAudioPlayback

/**
 * The screen-scoped voice-note player of the thread: ONE [VoiceNoteEngine] for every bubble,
 * released when the thread leaves composition. It mirrors the pure [ChatAudioPlayback] onto
 * the platform player and back — coverage-exempt glue, like [OverlayMediaPreview].
 *
 * It also speaks to the system (#13393): it takes the audio focus, publishes the playing voice note
 * to the [VoicePlaybackHost] (media session, lock-screen card, foreground notification) at each
 * break — new voice note, play, pause, seek — and obeys the host's [commands][VoicePlaybackHost.commands].
 * An interruption (call, other app's sound) or an unplugged headset pauses it; what resumes and what
 * does not is the shared [InterruptionResumeLedger], never decided here.
 */
@Stable
internal class ChatAudioPlayer internal constructor(
    private val player: VoiceNoteEngine,
    private val host: VoicePlaybackHost = NoVoicePlaybackHost,
    audioManager: AudioManager? = null,
    conversationTitle: String? = null,
    private val locale: Locale = Locale.getDefault(),
    private val zone: ZoneId = ZoneId.systemDefault(),
) {

    var playback: ChatAudioPlayback by mutableStateOf(ChatAudioPlayback.Idle)
        private set

    /** Le titre de la conversation, relu à chaque nouvelle carte : un renommage ne recrée pas le lecteur. */
    var conversationTitle: String? = conversationTitle

    private var card: VoicePlaybackCard? = null
    private val ledger = InterruptionResumeLedger()
    private val focus = audioManager?.let { ChatAudioFocus(it, ::onSystemEvent) }
    private val handler = Handler(Looper.getMainLooper())
    private val releaseFocus = Runnable { if (!playback.transport.isPlaying) focus?.abandon() }

    init {
        player.listen(onPrepared = ::onPrepared, onCompleted = ::onCompleted, onError = ::onError)
    }

    /** Touch on a bubble's voice note: load it, pause it, resume it, or switch to it. */
    fun toggle(audio: BubbleAudio, source: VoiceTrackSource? = null) {
        val next = playback.toggle(audio)
        val prev = playback
        val url = next.transport.currentUrl
        val switched = next.attachmentId != prev.attachmentId || url != prev.transport.currentUrl
        when {
            next.transport.isLoading && url != null && switched ->
                runCatching {
                    player.reset()
                    player.load(url)
                }.onFailure { playback = next.failed(); return }
            next.transport.isPlaying && !prev.transport.isPlaying -> {
                if (!startPlayer()) {
                    playback = next.paused()
                    return
                }
            }
            !next.transport.isPlaying && prev.transport.isPlaying -> runCatching { player.pause() }
        }
        playback = next
        if (switched) card = cardFor(audio, source)
        ledger.handle(
            if (next.transport.isPlaying || next.transport.isLoading) {
                InterruptionResumeLedger.Signal.UserStartedPlayback
            } else {
                InterruptionResumeLedger.Signal.UserPaused
            },
        )
        scheduleFocusRelease()
        publish()
    }

    /** What the bubble owning [audio] shows, or `null` when another voice note is loaded. */
    fun bubbleFor(audio: BubbleAudio): BubbleAudioPlayback? =
        playback.bubbleFor(audio.attachmentId, audio.durationSeconds)

    /** An order from the notification, the lock screen or a headset button. */
    fun handle(command: VoicePlaybackCommand) {
        when (command) {
            VoicePlaybackCommand.Play -> {
                ledger.handle(InterruptionResumeLedger.Signal.UserStartedPlayback)
                resumePlayback()
            }
            VoicePlaybackCommand.Pause -> {
                ledger.handle(InterruptionResumeLedger.Signal.UserPaused)
                pausePlayback()
                scheduleFocusRelease()
            }
            VoicePlaybackCommand.Stop -> stopPlayback()
            is VoicePlaybackCommand.SeekTo -> seekTo(command.positionMs)
            is VoicePlaybackCommand.Skip -> seekTo(currentPositionMs() + command.offsetMs)
        }
    }

    /** An interruption or a route change: the shared ledger says whether to pause, resume or do nothing. */
    internal fun onSystemEvent(event: MediaSessionEvent) {
        val signal = InterruptionResumeLedger.signalFor(event, playback.transport.isPlaying) ?: return
        when (ledger.handle(signal)) {
            InterruptionResumeLedger.Action.Pause -> pausePlayback()
            InterruptionResumeLedger.Action.Resume -> resumePlayback()
            InterruptionResumeLedger.Action.None -> Unit
        }
    }

    internal fun onPrepared() {
        if (startPlayer()) {
            playback = playback.ready()
            card = card?.copy(durationMs = player.durationMs)
        } else {
            playback = playback.ready().paused()
        }
        publish()
    }

    internal fun onCompleted() {
        playback = playback.ended()
        card = null
        ledger.handle(InterruptionResumeLedger.Signal.ContentReleased)
        focus?.abandon()
        host.retire()
    }

    internal fun onError() {
        playback = playback.failed()
        card = null
        ledger.handle(InterruptionResumeLedger.Signal.ContentReleased)
        focus?.abandon()
        host.retire()
    }

    internal fun tick() {
        val duration = player.durationMs
        val position = player.positionMs
        if (duration > 0) playback = playback.tick(position / 1000.0, duration / 1000.0)
    }

    internal fun release() {
        handler.removeCallbacks(releaseFocus)
        focus?.abandon()
        host.retire()
        runCatching { player.release() }
    }

    private fun startPlayer(): Boolean {
        if (focus != null && !focus.acquire()) return false
        return runCatching { player.start() }.isSuccess
    }

    private fun pausePlayback() {
        if (!playback.transport.isPlaying) return
        runCatching { player.pause() }
        tick()
        playback = playback.paused()
        publish()
    }

    private fun resumePlayback() {
        if (playback.transport.isPlaying || playback.transport.isLoading) return
        if (playback.transport.currentUrl == null) return
        handler.removeCallbacks(releaseFocus)
        if (!startPlayer()) return
        playback = playback.resumed()
        publish()
    }

    private fun stopPlayback() {
        runCatching { player.reset() }
        playback = playback.stopped()
        card = null
        ledger.handle(InterruptionResumeLedger.Signal.ContentReleased)
        focus?.abandon()
        host.retire()
    }

    private fun seekTo(positionMs: Long) {
        val target = VoicePlaybackCardRules.clamp(positionMs, player.durationMs)
        runCatching { player.seekTo(target) }
        playback = playback.seekedTo(target / 1000.0)
        publish()
    }

    private fun currentPositionMs(): Long =
        player.positionMs

    private fun scheduleFocusRelease() {
        handler.removeCallbacks(releaseFocus)
        if (!playback.transport.isPlaying) {
            handler.postDelayed(releaseFocus, ContentPlaybackSessionLaw.USER_PAUSE_RELEASE_DELAY_MILLIS)
        }
    }

    private fun cardFor(audio: BubbleAudio, source: VoiceTrackSource?): VoicePlaybackCard = VoicePlaybackCard(
        attachmentId = audio.attachmentId,
        sender = source?.sender,
        conversation = conversationTitle,
        sentAtLabel = VoicePlaybackCardRules.sentAtLabel(source?.createdAtIso, locale, zone),
        artworkUrl = source?.avatarUrl?.takeIf(VoicePlaybackCardRules::isArtworkFetchable),
        isProtected = source?.isProtected == true,
        durationMs = (audio.durationSeconds ?: 0) * 1000L,
    )

    private fun publish() {
        val current = card
        val transport = playback.transport
        if (playback.attachmentId == null || current == null || transport.currentUrl == null) {
            host.retire()
            return
        }
        host.publish(
            current,
            VoicePlaybackTransportState(
                positionMs = (transport.currentSeconds * 1000).toLong(),
                isPlaying = transport.isPlaying,
                isBuffering = transport.isLoading,
            ),
        )
    }
}

@Composable
internal fun rememberChatAudioPlayer(conversationTitle: String? = null): ChatAudioPlayer {
    val context = LocalContext.current
    val host = LocalVoicePlaybackHost.current
    val audioPlayer = remember(host) {
        ChatAudioPlayer(
            player = ExoVoiceNoteEngine(context),
            host = host,
            audioManager = context.getSystemService(AudioManager::class.java),
            conversationTitle = conversationTitle,
        )
    }
    SideEffect { audioPlayer.conversationTitle = conversationTitle }
    DisposableEffect(audioPlayer) {
        val unplugged = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                audioPlayer.onSystemEvent(MediaSessionEvent.RouteChangedOldDeviceUnavailable)
            }
        }
        ContextCompat.registerReceiver(
            context,
            unplugged,
            IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY),
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )
        onDispose {
            context.unregisterReceiver(unplugged)
            audioPlayer.release()
        }
    }
    LaunchedEffect(audioPlayer, host) {
        host.commands.collect { audioPlayer.handle(it) }
    }
    val isPlaying = audioPlayer.playback.transport.isPlaying
    LaunchedEffect(isPlaying) {
        while (isPlaying) {
            audioPlayer.tick()
            delay(TICK_MILLIS)
        }
    }
    return audioPlayer
}

private const val TICK_MILLIS = 200L
