package me.meeshy.sdk.playback

import android.content.Context
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource

/**
 * [AudioPlayerPort] sur Media3 [ExoPlayer] : la seule classe du moteur qui touche Media3. Le lecteur
 * gère lui-même le focus audio (perte → pause, gain → reprise de ce qu'il a suspendu) et le casque
 * débranché ; le moteur en est informé par [AudioPlayerPort.Listener.onPlayWhenReadyChanged].
 */
@UnstableApi
internal class ExoAudioPlayerPort(
    private val context: Context,
    private val sources: AudioPlaybackSources = AudioPlaybackSources.uncached(context),
) : AudioPlayerPort {

    private val player: ExoPlayer = ExoPlayer.Builder(context.applicationContext)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
                .build(),
            /* handleAudioFocus = */ true,
        )
        .setHandleAudioBecomingNoisy(true)
        .build()

    private var delegate: AudioPlayerPort.Listener? = null
    private var generation = 0
    private var prepared = false

    private var releaseLease: () -> Unit = {}

    private val localFactory: DataSource.Factory by lazy { DefaultDataSource.Factory(context.applicationContext) }

    init {
        player.addListener(
            object : Player.Listener {
                override fun onPlaybackStateChanged(playbackState: Int) {
                    when (playbackState) {
                        Player.STATE_READY -> if (!prepared) {
                            prepared = true
                            delegate?.onPrepared(generation, player.duration.takeIf { it != C.TIME_UNSET && it > 0 } ?: 0L)
                        }
                        Player.STATE_ENDED -> delegate?.onEnded(generation)
                        else -> Unit
                    }
                }

                override fun onPlayerError(error: PlaybackException) {
                    delegate?.onError(generation, error)
                }

                override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
                    delegate?.onPlayWhenReadyChanged(generation, playWhenReady)
                }
            },
        )
    }

    override fun setListener(listener: AudioPlayerPort.Listener?) {
        delegate = listener
    }

    override fun load(source: AudioSource, generation: Int, speed: Float) {
        this.generation = generation
        prepared = false
        player.playWhenReady = false
        player.setPlaybackParameters(PlaybackParameters(speed, PRESERVED_PITCH))
        player.setMediaSource(mediaSource(source))
        player.prepare()
    }

    /** Un vocal réseau passe par la couture (cache du compte, bail) ; un fichier local se lit directement. */
    private fun mediaSource(source: AudioSource): MediaSource {
        returnLease()
        return when (source) {
            is AudioSource.Remote -> sources.open(source.url, source.isProtected).also { releaseLease = it.release }.source
            is AudioSource.Local -> ProgressiveMediaSource.Factory(localFactory).createMediaSource(MediaItem.fromUri(source.fileUri))
        }
    }

    private fun returnLease() {
        val release = releaseLease
        releaseLease = {}
        release()
    }

    override fun play() {
        player.playWhenReady = true
    }

    override fun pause() {
        player.playWhenReady = false
    }

    override fun seekTo(positionMs: Long) = player.seekTo(positionMs)

    override fun setSpeed(speed: Float) = player.setPlaybackParameters(PlaybackParameters(speed, PRESERVED_PITCH))

    override fun positionMs(): Long = player.currentPosition

    override fun stop() {
        prepared = false
        player.stop()
        player.clearMediaItems()
        returnLease()
    }

    override fun release() {
        delegate = null
        returnLease()
        player.release()
    }

    private companion object {
        /** Hauteur inchangée quelle que soit la vitesse : un vocal à ×2 ne devient pas un dessin animé. */
        const val PRESERVED_PITCH = 1f
    }
}
