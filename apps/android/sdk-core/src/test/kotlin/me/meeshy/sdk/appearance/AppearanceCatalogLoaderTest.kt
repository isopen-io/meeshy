package me.meeshy.sdk.appearance

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import java.io.ByteArrayInputStream
import java.io.FileNotFoundException
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.appearance.AppearanceCatalog
import me.meeshy.sdk.model.appearance.AppearancePackDomain
import me.meeshy.sdk.model.appearance.WallpaperDesign
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class AppearanceCatalogLoaderTest {

    private val executors = mutableListOf<java.util.concurrent.ExecutorService>()

    @After
    fun tearDown() {
        executors.forEach { it.shutdownNow() }
    }

    private class RecordedError(val cause: Throwable, val message: String)

    private class Spy {
        val opens = AtomicInteger()
        val readOn = mutableListOf<String>()
        val errors = mutableListOf<RecordedError>()
    }

    private fun namedDispatcher(name: String): CoroutineDispatcher {
        val executor = Executors.newSingleThreadExecutor { Thread(it, name) }
        executors += executor
        return executor.asCoroutineDispatcher()
    }

    private fun loader(spy: Spy, source: () -> java.io.InputStream): AppearanceCatalogLoader =
        AppearanceCatalogLoader(
            asset = AppearanceCatalogAsset {
                spy.opens.incrementAndGet()
                synchronized(spy.readOn) { spy.readOn += Thread.currentThread().name }
                source()
            },
            ioDispatcher = namedDispatcher(IO_THREAD),
            errors = AppearanceCatalogErrorLog { cause, message -> spy.errors += RecordedError(cause, message) },
        )

    private fun textLoader(spy: Spy, text: String) = loader(spy) { ByteArrayInputStream(text.toByteArray()) }

    private fun realLoader(spy: Spy): AppearanceCatalogLoader {
        val context = ApplicationProvider.getApplicationContext<Context>()
        return loader(spy) { context.assets.open(AppearanceCatalogLoader.ASSET_NAME) }
    }

    // --- Le vrai fichier embarqué --------------------------------------------------------

    @Test
    fun `the real embedded file loads in full from the assets`() = runTest {
        val spy = Spy()

        val catalog = realLoader(spy).catalog()

        assertThat(catalog.version).isEqualTo(1)
        assertThat(catalog.gamut.entries).hasSize(16)
        assertThat(catalog.wallpaperPacks).hasSize(5)
        assertThat(catalog.bannerPacks).hasSize(2)
        assertThat(catalog.ringPacks).hasSize(9)
        assertThat(catalog.bannerFramePacks).hasSize(7)
        assertThat(catalog.wallpaperPacks.sumOf { it.designs.size }).isEqualTo(15)
        assertThat(catalog.ringPacks.sumOf { it.rings.size }).isEqualTo(21)
        assertThat(catalog.bannerFramePacks.sumOf { it.frames.size }).isEqualTo(14)
        assertThat(spy.errors).isEmpty()
    }

    @Test
    fun `the real file serves the seven languages and the default packs without a network`() = runTest {
        val catalog = realLoader(Spy()).catalog()

        listOf("fr", "en", "es", "pt", "de", "it", "ar").forEach {
            assertThat(catalog.packName("essentiels", it)).isNotEmpty()
        }
        assertThat(catalog.defaultInstalledPacks(AppearancePackDomain.WALLPAPER).map { it.slug })
            .containsExactly("essentiels", "animes").inOrder()
        assertThat(catalog.wallpaper("essentiels", "monogramme")).isInstanceOf(WallpaperDesign.Designed::class.java)
        assertThat(catalog.wallpaper("essentiels", "inconnu")).isEqualTo(WallpaperDesign.Signature)
    }

    // --- Une seule lecture, hors du fil principal -----------------------------------------

    @Test
    fun `nothing is read before the first request`() = runTest {
        val spy = Spy()
        val loader = textLoader(spy, "{}")

        assertThat(spy.opens.get()).isEqualTo(0)
        assertThat(loader.current).isNull()
        assertThat(loader.state.value).isNull()
    }

    @Test
    fun `the file is read once however many times the catalog is asked`() = runTest {
        val spy = Spy()
        val loader = realLoader(spy)

        val first = loader.catalog()
        val second = loader.catalog()

        assertThat(second).isSameInstanceAs(first)
        assertThat(spy.opens.get()).isEqualTo(1)
    }

    @Test
    fun `concurrent first requests share one read`() = runTest {
        val spy = Spy()
        val loader = realLoader(spy)

        val catalogs = (1..8).map { async { loader.catalog() } }.awaitAll()

        assertThat(spy.opens.get()).isEqualTo(1)
        assertThat(catalogs.distinct()).hasSize(1)
    }

    @Test
    fun `the read happens on the injected IO dispatcher, never on the caller's thread`() = runTest {
        val spy = Spy()
        val callerThread = Thread.currentThread().name

        realLoader(spy).catalog()

        assertThat(spy.readOn).containsExactly(IO_THREAD)
        assertThat(spy.readOn).doesNotContain(callerThread)
    }

    @Test
    fun `once loaded the catalog is available without waiting`() = runTest {
        val spy = Spy()
        val loader = realLoader(spy)

        val catalog = loader.catalog()

        assertThat(loader.current).isSameInstanceAs(catalog)
        assertThat(loader.state.value).isSameInstanceAs(catalog)
    }

    // --- Jamais un plantage ----------------------------------------------------------------

    @Test
    fun `an invalid file gives an empty catalog and a logged error, never a crash`() = runTest {
        val spy = Spy()

        val catalog = textLoader(spy, "{ceci n'est pas du json").catalog()

        assertThat(catalog).isSameInstanceAs(AppearanceCatalog.EMPTY)
        assertThat(spy.errors).hasSize(1)
        assertThat(spy.errors.single().message).contains("illisible")
    }

    @Test
    fun `an absent file gives an empty catalog and a logged error, never a crash`() = runTest {
        val spy = Spy()

        val catalog = loader(spy) { throw FileNotFoundException("appearance-catalog.json") }.catalog()

        assertThat(catalog.isEmpty).isTrue()
        assertThat(spy.errors).hasSize(1)
        assertThat(spy.errors.single().cause).isInstanceOf(FileNotFoundException::class.java)
        assertThat(spy.errors.single().message).contains("introuvable")
    }

    @Test
    fun `an empty catalog resolves every wallpaper to Signature`() = runTest {
        val catalog = textLoader(Spy(), "[]").catalog()

        assertThat(catalog.wallpaper("essentiels", "monogramme")).isEqualTo(WallpaperDesign.Signature)
        assertThat(catalog.defaultWallpapers).isEmpty()
    }

    @Test
    fun `a failure is remembered like a success — the broken file is not re-read at every call`() = runTest {
        val spy = Spy()
        val loader = textLoader(spy, "pas du json")

        loader.catalog()
        loader.catalog()

        assertThat(spy.opens.get()).isEqualTo(1)
        assertThat(spy.errors).hasSize(1)
    }

    @Test
    fun `a readable file with a corrupted design keeps the rest of the catalog`() = runTest {
        val text = """{"version":3,"wallpapers":[{"slug":"essentiels","designs":[{"key":"casse","style":"inconnu"}]}],"unknown":1}"""

        val catalog = textLoader(Spy(), text).catalog()

        assertThat(catalog.version).isEqualTo(3)
        assertThat(catalog.wallpaperPacks.single().designs).isEmpty()
    }

    private companion object {
        const val IO_THREAD = "catalogue-io"
    }
}
