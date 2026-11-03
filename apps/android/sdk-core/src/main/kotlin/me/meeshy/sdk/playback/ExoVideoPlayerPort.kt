package me.meeshy.sdk.playback

import android.content.Context
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.source.MediaSource

/**
 * [VideoPlayerPort] sur Media3 [ExoPlayer] : la seule classe du moteur vidéo qui touche Media3.
 *
 * La boucle est une FILE de deux éléments du même média (l'élément en cours + son successeur) : la
 * file enchaîne sans trou, et chaque tour réarme un successeur ([queueLoopSuccessor]).
 * [mediaSourceFactory] reçoit l'URI à lire : le cache disque des vidéos s'y branche sans que ce module
 * le connaisse.
 */
@UnstableApi
internal class ExoVideoPlayerPort(
    context: Context,
    private val mediaSourceFactory: (uri: String) -> MediaSource.Factory = { DefaultMediaSourceFactory(context.applicationContext) },
    private val onCreated: () -> Unit = {},
) : VideoPlayerPort {

    private val player: ExoPlayer = ExoPlayer.Builder(context.applicationContext).build().also { onCreated() }

    private var delegate: VideoPlayerPort.Listener? = null
    private var generation = 0
    private var prepared = false
    private var loadedUri: String? = null
    private var loadedLocal = false

    override val playsLocalFile: Boolean get() = loadedLocal
    override val isReady: Boolean get() = player.playbackState == Player.STATE_READY

    init {
        player.setAudioAttributes(
            AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(),
            /* handleAudioFocus = */ true,
        )
        player.addListener(
            object : Player.Listener {
                override fun onPlaybackStateChanged(playbackState: Int) {
                    when (playbackState) {
                        Player.STATE_READY -> if (!prepared) {
                            prepared = true
                            delegate?.onPrepared(generation, durationOrZero())
                        }
                        Player.STATE_ENDED -> delegate?.onEnded(generation)
                        else -> Unit
                    }
                }

                override fun onRenderedFirstFrame() {
                    delegate?.onFirstFrame(generation)
                }

                override fun onIsPlayingChanged(isPlaying: Boolean) {
                    delegate?.onIsPlayingChanged(generation, isPlaying)
                }

                override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                    if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO) delegate?.onLoopTurn(generation)
                }

                override fun onPlayerError(error: PlaybackException) {
                    delegate?.onError(generation, error)
                }
            },
        )
    }

    private fun durationOrZero(): Long = player.duration.takeIf { it != C.TIME_UNSET && it > 0 } ?: 0L

    override fun setListener(listener: VideoPlayerPort.Listener?) {
        delegate = listener
    }

    override fun load(source: VideoSource, generation: Int, speed: Float) {
        this.generation = generation
        prepared = false
        loadedUri = source.uri
        loadedLocal = source.isLocalFile
        player.playWhenReady = false
        player.setPlaybackParameters(PlaybackParameters(speed, PRESERVED_PITCH))
        player.setMediaSource(mediaSourceFor(source.uri))
        player.prepare()
    }

    private fun mediaSourceFor(uri: String): MediaSource =
        mediaSourceFactory(uri).createMediaSource(MediaItem.fromUri(uri))

    override fun play() {
        player.playWhenReady = true
    }

    override fun pause() {
        player.playWhenReady = false
    }

    override fun seekTo(positionMs: Long) = player.seekTo(positionMs)

    override fun setSpeed(speed: Float) = player.setPlaybackParameters(PlaybackParameters(speed, PRESERVED_PITCH))

    override fun setMuted(muted: Boolean) {
        player.volume = if (muted) 0f else 1f
    }

    override fun setAudioTracksEnabled(enabled: Boolean) {
        player.trackSelectionParameters = player.trackSelectionParameters.buildUpon()
            .setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, !enabled)
            .build()
    }

    override fun setLooping(looping: Boolean) {
        player.repeatMode = Player.REPEAT_MODE_OFF
        if (!looping) dropLoopSuccessors()
    }

    override fun queueLoopSuccessor(): Boolean {
        val uri = loadedUri ?: return false
        if (player.mediaItemCount != 1) return player.mediaItemCount > 1
        player.addMediaSource(mediaSourceFor(uri))
        return true
    }

    override fun dropLoopSuccessors() {
        val count = player.mediaItemCount
        if (count > 1) player.removeMediaItems(1, count)
    }

    override fun positionMs(): Long = player.currentPosition

    override fun stop() {
        prepared = false
        loadedUri = null
        loadedLocal = false
        player.stop()
        player.clearMediaItems()
    }

    override fun release() {
        delegate = null
        player.release()
    }

    private companion object {
        const val PRESERVED_PITCH = 1f
    }
}
