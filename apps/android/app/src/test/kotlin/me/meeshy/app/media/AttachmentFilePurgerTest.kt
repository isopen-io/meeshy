package me.meeshy.app.media

import coil.ImageLoader
import coil.disk.DiskCache
import coil.memory.MemoryCache
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import me.meeshy.sdk.media.MediaCacheDirs
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.sdk.model.mediacache.MediaCacheKey
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/** #13615 : une pièce supprimée quitte tous les caches disque du compte courant, et ceux-là seuls. */
class AttachmentFilePurgerTest {

    @get:Rule
    val folder = TemporaryFolder()

    private val gone = "https://m.test/gone.jpg"
    private val kept = "https://m.test/kept.jpg"

    @Test
    fun `la pièce quitte le disque Coil, la mémoire, les tronçons Media3 et les fichiers posés, pas la voisine`() {
        val dirs = MediaCacheDirs(folder.newFolder("durable"), folder.newFolder("purgeable"))
        val goneFile = File(dirs.dirFor(MediaCacheCategory.IMAGES).apply { mkdirs() }, MediaCacheKey.of(gone)).apply { writeText("x") }
        val keptFile = File(dirs.dirFor(MediaCacheCategory.IMAGES), MediaCacheKey.of(kept)).apply { writeText("x") }
        val goneKey = MemoryCache.Key(gone)
        val keptKey = MemoryCache.Key(kept)
        val memory: MemoryCache = mockk(relaxed = true) { every { keys } returns setOf(goneKey, keptKey) }
        val disk: DiskCache = mockk(relaxed = true)
        val loader: ImageLoader = mockk {
            every { memoryCache } returns memory
            every { diskCache } returns disk
        }
        val evicted = mutableListOf<String>()

        runBlocking { AttachmentFilePurger({ loader }, { evicted += it }, dirs, Dispatchers.Unconfined).purge(setOf(gone)) }

        verify { disk.remove(gone) }
        verify(exactly = 0) { disk.remove(kept) }
        verify { memory.remove(goneKey) }
        verify(exactly = 0) { memory.remove(keptKey) }
        assertThat(evicted).containsExactly(gone)
        assertThat(goneFile.exists()).isFalse()
        assertThat(keptFile.exists()).isTrue()
    }

    @Test
    fun `un chargeur sans cache et un média absent se purgent sans erreur`() {
        val loader: ImageLoader = mockk {
            every { memoryCache } returns null
            every { diskCache } returns null
        }
        val dirs = MediaCacheDirs(folder.newFolder("d"), folder.newFolder("p"))

        runBlocking { AttachmentFilePurger({ loader }, { error("Media3 indisponible") }, dirs, Dispatchers.Unconfined).purge(setOf(gone)) }
    }
}
