package me.meeshy.app.media

import android.content.Context
import coil.imageLoader
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.media.UploadedMediaCache
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.ui.component.media.CoilUploadedImageCache
import me.meeshy.ui.component.media.MeeshyMediaCache

/**
 * Les octets d'un média tout juste envoyé entrent au cache qui le servira : les images au cache disque de Coil
 * (#13876), l'audio et la vidéo aux caches Media3 (#13861).
 */
@Module
@InstallIn(SingletonComponent::class)
object UploadedMediaCacheModule {
    @Provides
    fun uploadedMediaCache(@ApplicationContext context: Context): UploadedMediaCache {
        val media = MeeshyMediaCache.get(context)
        return UploadedMediaCache.byCategory(
            mapOf(
                MediaCacheCategory.IMAGES to CoilUploadedImageCache { context.imageLoader },
                MediaCacheCategory.AUDIO to media,
                MediaCacheCategory.VIDEO to media,
            ),
        )
    }
}
