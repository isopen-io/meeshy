package me.meeshy.sdk.playback

import android.content.Context
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.cache.Cache
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import java.io.File

/**
 * Le cache disque des vocaux : un second passage (hors ligne compris) ne re-télécharge pas. Un seul
 * [SimpleCache] par dossier et par processus — deux instances sur le même dossier planteraient.
 */
@UnstableApi
internal object AudioDiskCache {
    private const val MAX_BYTES = 64L * 1024 * 1024
    private var instance: Cache? = null

    @Synchronized
    fun get(context: Context): Cache = instance ?: SimpleCache(
        File(context.applicationContext.cacheDir, "audio-playback"),
        LeastRecentlyUsedCacheEvictor(MAX_BYTES),
        StandaloneDatabaseProvider(context.applicationContext),
    ).also { instance = it }
}

/**
 * [AudioPlayerPort] sur Media3 [ExoPlayer] : la seule classe du moteur qui touche Media3. Le lecteur
 * gère lui-même le focus audio (perte → pause, gain → reprise de ce qu'il a suspendu) et le casque
 * débranché ; le moteur en est informé par [AudioPlayerPort.Listener.onPlayWhenReadyChanged].
 */
@UnstableApi
internal class ExoAudioPlayerPort(private val context: Context) : AudioPlayerPort {

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

    private val remoteFactory: DataSource.Factory by lazy {
        CacheDataSource.Factory()
            .setCache(AudioDiskCache.get(context))
            .setUpstreamDataSourceFactory(DefaultDataSource.Factory(context.applicationContext))
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
    }

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

    private fun mediaSource(source: AudioSource): MediaSource = when (source) {
        is AudioSource.Remote -> ProgressiveMediaSource.Factory(remoteFactory).createMediaSource(MediaItem.fromUri(source.url))
        is AudioSource.Local -> ProgressiveMediaSource.Factory(localFactory).createMediaSource(MediaItem.fromUri(source.fileUri))
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
    }

    override fun release() {
        delegate = null
        player.release()
    }

    private companion object {
        /** Hauteur inchangée quelle que soit la vitesse : un vocal à ×2 ne devient pas un dessin animé. */
        const val PRESERVED_PITCH = 1f
    }
}
