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
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.conversation.DeletedAttachmentFilePurger
import me.meeshy.sdk.media.MediaCacheDirs
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.sdk.model.mediacache.MediaCacheKey
import me.meeshy.ui.component.media.MeeshyMediaCache

/**
 * Une pièce supprimée (`attachment:deleted`) ne laisse aucune trace sur le disque : image Coil (disque et mémoire, clé
 * = URL), tronçons audio / vidéo Media3 et fichiers posés sous leur clé canonique. Ces caches sont ceux du compte
 * courant (vidés à son départ par les `PerAccountCache`) ; l'applicateur n'invoque la purge que sous le compte auquel
 * l'événement est arrivé. La purge parcourt des fichiers : elle tourne sur [io].
 */
class AttachmentFilePurger internal constructor(
    private val images: () -> ImageLoader,
    private val evictMedia: (String) -> Unit,
    private val dirs: MediaCacheDirs,
    private val io: CoroutineDispatcher,
) : DeletedAttachmentFilePurger {

    @Inject
    constructor(@ApplicationContext context: Context) : this(
        { context.imageLoader },
        { url -> MeeshyMediaCache.get(context).evict(url) },
        MediaCacheDirs(context.cacheDir, context.cacheDir),
        Dispatchers.IO,
    )

    @OptIn(ExperimentalCoilApi::class)
    override suspend fun purge(urls: Set<String>) = withContext(io) {
        val loader = images()
        urls.forEach { url ->
            loader.diskCache?.remove(url)
            loader.memoryCache?.let { memory -> memory.keys.filter { it.key == url }.forEach(memory::remove) }
            runCatching { evictMedia(url) }
            MediaCacheCategory.entries.forEach { category ->
                runCatching { java.io.File(dirs.dirFor(category), MediaCacheKey.of(url)).delete() }
            }
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface AttachmentFilePurgerModule {
    @Binds
    @Singleton
    fun attachmentFilePurger(impl: AttachmentFilePurger): DeletedAttachmentFilePurger
}
