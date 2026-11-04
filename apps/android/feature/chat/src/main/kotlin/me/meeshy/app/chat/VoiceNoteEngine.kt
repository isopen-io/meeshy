package me.meeshy.app.chat

import android.content.Context
import android.net.Uri
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.source.MediaSource
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.sdk.media.LocalMediaFileResolver
import me.meeshy.sdk.media.MediaCacheDirs
import me.meeshy.ui.component.media.MeeshyMediaCache

/**
 * The platform player under [ChatAudioPlayer] and the message menu's [OverlayAudioPreview], reduced
 * to what a voice note needs. Audio focus is the caller's business, never the engine's.
 */
internal interface VoiceNoteEngine {
    val positionMs: Long
    val durationMs: Long

    fun listen(onPrepared: () -> Unit, onCompleted: () -> Unit, onError: () -> Unit)
    fun load(url: String)

    /**
     * A protected voice note (ephemeral, view-once, blurred, sealed) is read straight from its source: never
     * written to the disk cache, so nothing of it survives the screen. An engine with no disk cache keeps [load].
     */
    fun loadUncached(url: String) = load(url)

    fun start()
    fun pause()
    fun seekTo(positionMs: Long)
    fun setSpeed(rate: Float)
    fun reset()
    fun release()
}

/** The Media3 source of one voice note, and the lease that keeps its bytes in the disk cache while it is loaded. */
@OptIn(UnstableApi::class)
internal class VoiceNoteSource(val source: MediaSource, val release: () -> Unit)

/** Where the engine gets the Media3 source of a voice note: the AUDIO disk cache in the app, a fake in a test. */
internal fun interface VoiceNoteSources {
    fun open(url: String): VoiceNoteSource

    companion object {
        /**
         * Reads through the AUDIO disk cache (cache-first, #14568): a voice note already heard plays again with
         * no network, in airplane mode too, and while it is loaded its bytes are leased against eviction. A
         * local file is read directly, the cache never duplicates it. The end-of-session wipe (ADR-027) is
         * the cache's own, unchanged. A voice note adopted WHOLE at the ack of its send (#15428, `MediaAdoption`) is
         * read from that file: replayed right after, offline, it plays.
         */
        @OptIn(UnstableApi::class)
        fun cached(context: Context): VoiceNoteSources {
            val cache = MeeshyMediaCache.get(context)
            val typed = LocalMediaFileResolver(MediaCacheDirs(context.cacheDir, context.cacheDir))
            return VoiceNoteSources { url ->
                val whole = typed.fileFor(MediaCacheCategory.AUDIO, url)
                if (whole != null) {
                    return@VoiceNoteSources VoiceNoteSource(
                        source = DefaultMediaSourceFactory(context).createMediaSource(MediaItem.fromUri(Uri.fromFile(whole))),
                        release = {},
                    )
                }
                VoiceNoteSource(
                    source = cache.mediaSourceFactory(MediaCacheCategory.AUDIO, url).createMediaSource(MediaItem.fromUri(url)),
                    release = cache.lease(url),
                )
            }
        }
    }
}

/**
 * Media3 rather than `MediaPlayer` (#13674): translated voice notes are Ogg Opus, and the platform
 * player only opens the Ogg container from Android 10 — below it, the note played in silence.
 * ExoPlayer ships its own Ogg extractor.
 */
@OptIn(UnstableApi::class)
internal class ExoVoiceNoteEngine(
    context: Context,
    private val sources: VoiceNoteSources = VoiceNoteSources.cached(context),
) : VoiceNoteEngine {

    private val player = ExoPlayer.Builder(context).build().apply {
        setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
                .build(),
            false,
        )
        setWakeMode(C.WAKE_MODE_NETWORK)
    }
    private var awaitingReady = false
    private var releaseLease: () -> Unit = {}

    /** La dernière erreur du lecteur : « le vocal a échoué » ne dit pas POURQUOI, et un témoin doit pouvoir le dire. */
    internal var lastError: PlaybackException? = null
        private set

    override val positionMs: Long get() = player.currentPosition.coerceAtLeast(0L)
    override val durationMs: Long get() = player.duration.takeIf { it != C.TIME_UNSET }?.coerceAtLeast(0L) ?: 0L
    val speed: Float get() = player.playbackParameters.speed

    override fun listen(onPrepared: () -> Unit, onCompleted: () -> Unit, onError: () -> Unit) {
        player.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                when {
                    state == Player.STATE_READY && awaitingReady -> {
                        awaitingReady = false
                        onPrepared()
                    }
                    state == Player.STATE_ENDED -> onCompleted()
                }
            }

            override fun onPlayerError(error: PlaybackException) {
                awaitingReady = false
                lastError = error
                onError()
            }
        })
    }

    override fun load(url: String) {
        loadWith {
            val opened = sources.open(url)
            releaseLease = opened.release
            player.setMediaSource(opened.source)
        }
    }

    override fun loadUncached(url: String) {
        loadWith { player.setMediaItem(MediaItem.fromUri(url)) }
    }

    private fun loadWith(setSource: () -> Unit) {
        awaitingReady = true
        player.playWhenReady = false
        giveLeaseBack()
        setSource()
        player.prepare()
    }

    private fun giveLeaseBack() {
        releaseLease()
        releaseLease = {}
    }

    override fun start() {
        if (player.playbackState == Player.STATE_ENDED) player.seekTo(0L)
        player.play()
    }

    override fun pause() {
        player.pause()
    }

    override fun seekTo(positionMs: Long) {
        player.seekTo(positionMs)
    }

    override fun setSpeed(rate: Float) {
        player.setPlaybackSpeed(rate)
    }

    override fun reset() {
        awaitingReady = false
        player.stop()
        player.clearMediaItems()
        giveLeaseBack()
    }

    override fun release() {
        giveLeaseBack()
        player.release()
    }
}
