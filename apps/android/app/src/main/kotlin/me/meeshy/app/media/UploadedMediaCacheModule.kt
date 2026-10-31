package me.meeshy.app.media

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.media.UploadedMediaCache
import me.meeshy.ui.component.media.MeeshyMediaCache

/** Les octets d'un média tout juste envoyé entrent aux caches Media3 de l'app (#13861). */
@Module
@InstallIn(SingletonComponent::class)
object UploadedMediaCacheModule {
    @Provides
    fun uploadedMediaCache(@ApplicationContext context: Context): UploadedMediaCache = MeeshyMediaCache.get(context)
}
