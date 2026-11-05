package me.meeshy.app.media

import android.content.Context
import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.source.MediaSource
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import java.io.File
import me.meeshy.sdk.media.LocalMediaFileResolver
import me.meeshy.sdk.media.MediaCacheDirs
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.sdk.playback.AudioPlaybackSource
import me.meeshy.sdk.playback.AudioPlaybackSources
import me.meeshy.ui.component.media.MeeshyMediaCache

/**
 * D'où le moteur partagé lit un vocal réseau : le cache AUDIO du compte (budget, clôture d'époque à la fin de
 * session, bail contre l'éviction) comme le lecteur de bulle du fil. Un vocal protégé (éphémère, vue unique,
 * flouté, chiffré) passe par la lecture directe : ni cache, ni bail, aucun octet sur le disque. Un vocal que
 * j'ai envoyé, adopté ENTIER dans le cache AUDIO sous son adresse servie (#16012), se lit depuis ce fichier :
 * il rejoue hors ligne dès l'accusé, sans attendre qu'un tronçon Media3 l'ait jamais vu passer.
 */
@UnstableApi
internal class MediaCacheAudioSources(
    private val cached: (url: String) -> MediaSource.Factory,
    private val direct: () -> MediaSource.Factory,
    private val lease: (url: String) -> () -> Unit,
    private val whole: (url: String) -> File? = { null },
) : AudioPlaybackSources {

    override fun open(url: String, isProtected: Boolean): AudioPlaybackSource {
        val item = MediaItem.fromUri(url)
        if (isProtected) return AudioPlaybackSource(direct().createMediaSource(item))
        whole(url)?.let { return AudioPlaybackSource(direct().createMediaSource(MediaItem.fromUri(Uri.fromFile(it)))) }
        return AudioPlaybackSource(cached(url).createMediaSource(item), lease(url))
    }

    companion object {
        fun over(cache: MeeshyMediaCache, adopted: LocalMediaFileResolver) = MediaCacheAudioSources(
            cached = { url -> cache.mediaSourceFactory(MediaCacheCategory.AUDIO, url) },
            direct = cache::uncachedMediaSourceFactory,
            lease = cache::lease,
            whole = { url -> adopted.fileFor(MediaCacheCategory.AUDIO, url) },
        )
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal object SharedAudioCacheModule {
    @OptIn(UnstableApi::class)
    @Provides
    fun audioPlaybackSources(@ApplicationContext context: Context): AudioPlaybackSources =
        MediaCacheAudioSources.over(
            MeeshyMediaCache.get(context),
            LocalMediaFileResolver(MediaCacheDirs(context.cacheDir, context.cacheDir)),
        )
}
