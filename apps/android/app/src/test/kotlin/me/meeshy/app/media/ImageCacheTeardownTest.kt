package me.meeshy.app.media

import coil.ImageLoader
import coil.disk.DiskCache
import coil.memory.MemoryCache
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.runBlocking
import org.junit.Test
import java.util.concurrent.Executors

/** #13568 : la fin d'une session vide le cache d'images Coil — mémoire ET disque — hors du fil appelant. */
class ImageCacheTeardownTest {

    private companion object {
        fun threadName(): String = Thread.currentThread().name.substringBefore(" @")
    }

    private class Rig {
        val cleared = mutableListOf<String>()
        val memory: MemoryCache = mockk { every { clear() } answers { cleared += "memory:" + threadName() } }
        val disk: DiskCache = mockk { every { clear() } answers { cleared += "disk:" + threadName() } }
        val loader: ImageLoader = mockk {
            every { memoryCache } returns memory
            every { diskCache } returns disk
        }
        val io = Executors.newSingleThreadExecutor { runnable -> Thread(runnable, "image-teardown-io") }.asCoroutineDispatcher()
        val teardown = ImageCacheTeardown({ loader }, io)
    }

    @Test
    fun `la purge de session vide le cache memoire et le cache disque de Coil, hors du fil appelant`() {
        val rig = Rig()

        runBlocking { rig.teardown.clear() }
        rig.io.close()

        assertThat(rig.cleared).containsExactly("memory:image-teardown-io", "disk:image-teardown-io")
    }

    @Test
    fun `un chargeur sans cache se purge sans erreur`() {
        val loader: ImageLoader = mockk {
            every { memoryCache } returns null
            every { diskCache } returns null
        }
        val io = Executors.newSingleThreadExecutor().asCoroutineDispatcher()

        runBlocking { ImageCacheTeardown({ loader }, io).clear() }
        io.close()
    }
}
