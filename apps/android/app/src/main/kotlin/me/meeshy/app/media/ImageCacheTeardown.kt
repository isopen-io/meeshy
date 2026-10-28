package me.meeshy.app.media

import android.content.Context
import coil.ImageLoader
import coil.annotation.ExperimentalCoilApi
import coil.imageLoader
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.session.PerAccountCache
import javax.inject.Inject

/**
 * À la déconnexion ou au changement de compte, les images du compte quitté (avatars, vignettes, médias) quittent le
 * cache Coil, en mémoire ET sur le disque (#13568) : le chargeur partagé de l'application ne connaît pas les comptes.
 * La purge du disque parcourt des fichiers : elle tourne sur [io], jamais sur le fil appelant.
 */
class ImageCacheTeardown internal constructor(
    private val loader: () -> ImageLoader,
    private val io: CoroutineDispatcher,
) : PerAccountCache {

    @Inject
    constructor(@ApplicationContext context: Context) : this({ context.imageLoader }, Dispatchers.IO)

    @OptIn(ExperimentalCoilApi::class)
    override suspend fun clear() = withContext(io) {
        val images = loader()
        images.memoryCache?.clear()
        images.diskCache?.clear()
        Unit
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface ImageCacheTeardownModule {
    @Binds
    @IntoSet
    fun imageCacheTeardown(impl: ImageCacheTeardown): PerAccountCache
}
