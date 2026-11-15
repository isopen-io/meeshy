package me.meeshy.ui.component.lottie

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.appearance.AppearanceCatalog
import me.meeshy.sdk.model.pack.PackAssetRef
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File
import java.util.concurrent.atomic.AtomicInteger

/** #13952 — d'où viennent les octets d'une couche : embarqués, puis magasin disque vérifié, puis réseau. */
@RunWith(RobolectricTestRunner::class)
class PackFileReadersTest {
    @get:Rule
    val temp = TemporaryFolder()

    private val bytes = EMPTY_FILM_JSON.toByteArray()
    private val ref = PackAssetRef.of("${LottieLayerSource.sha256Hex(bytes).take(16)}.json", bytes.size.toLong(), LottieLayerSource.sha256Hex(bytes))!!

    private class Counting(val data: ByteArray?) : PackFileReader {
        val reads = AtomicInteger()
        override suspend fun read(ref: PackAssetRef): ByteArray? {
            reads.incrementAndGet()
            return data
        }
    }

    @Test fun `the first reader that has the file wins, the next ones are not asked`() = runTest {
        val bundled = Counting(bytes)
        val network = Counting(bytes)
        assertThat(PackFileReaders.firstOf(bundled, network).read(ref)).isEqualTo(bytes)
        assertThat(network.reads.get()).isEqualTo(0)
    }

    @Test fun `a reader without the file hands over to the next`() = runTest {
        val network = Counting(bytes)
        assertThat(PackFileReaders.firstOf(Counting(null), network).read(ref)).isEqualTo(bytes)
        assertThat(network.reads.get()).isEqualTo(1)
    }

    @Test fun `a bundled file is read from its content-addressed folder`() = runTest {
        val opened = mutableListOf<String>()
        val reader = BundledPackFileReader { path -> opened += path; bytes.inputStream() }
        assertThat(reader.read(ref)).isEqualTo(bytes)
        assertThat(opened).containsExactly("appearance-lottie/${ref.src}")
    }

    @Test fun `a missing bundled file reads null instead of failing`() = runTest {
        val reader = BundledPackFileReader { throw java.io.FileNotFoundException(it) }
        assertThat(reader.read(ref)).isNull()
    }

    @Test fun `the disk store downloads once, then serves the verified copy`() = runTest {
        val network = Counting(bytes)
        val store = DiskCachedPackFileReader(temp.root, network)
        assertThat(store.read(ref)).isEqualTo(bytes)
        assertThat(store.read(ref)).isEqualTo(bytes)
        assertThat(network.reads.get()).isEqualTo(1)
    }

    @Test fun `a download whose fingerprint is wrong is never kept`() = runTest {
        val network = Counting(bytes + 1)
        val store = DiskCachedPackFileReader(temp.root, network)
        assertThat(store.read(ref)).isNull()
        assertThat(temp.root.listFiles().orEmpty().filter { it.isFile }).isEmpty()
    }

    @Test fun `a tampered copy on disk is dropped and fetched again`() = runTest {
        File(temp.root, ref.src).writeBytes("altéré".toByteArray())
        val network = Counting(bytes)
        assertThat(DiskCachedPackFileReader(temp.root, network).read(ref)).isEqualTo(bytes)
        assertThat(network.reads.get()).isEqualTo(1)
        assertThat(File(temp.root, ref.src).readBytes()).isEqualTo(bytes)
    }

    @Test fun `every layer of the embedded catalog is bundled, fingerprint and size verified, and nothing else is`() = runTest {
        val assets = repositoryFile("sdk-core/src/main/assets")
        val catalog = AppearanceCatalog.decode(File(assets, "appearance-catalog.json").readText())
        val reader = BundledPackFileReader { path -> File(assets, path).inputStream() }
        catalog.lottieLayers.forEach { layer ->
            val data = reader.read(layer)
            assertWithMessage(layer.src).that(data).isNotNull()
            assertWithMessage(layer.src).that(data!!.size.toLong()).isEqualTo(layer.bytes)
            assertWithMessage(layer.src).that(LottieLayerSource.sha256Hex(data)).isEqualTo(layer.sha256)
            assertWithMessage(layer.src).that(LottieLayerSource.decodeFilm(data)).isNotNull()
        }
        val bundled = File(assets, BundledPackFileReader.FOLDER).list().orEmpty().toSet()
        assertThat(bundled).isEqualTo(catalog.lottieLayers.map { it.src }.toSet())
    }

    private fun repositoryFile(relative: String): File {
        val candidates = generateSequence(File(".").absoluteFile) { it.parentFile }.take(8).flatMap {
            sequenceOf(File(it, relative), File(it, "apps/android/$relative"))
        }
        return checkNotNull(candidates.firstOrNull { it.exists() }) { "$relative introuvable depuis ${File(".").absolutePath}" }
    }
}
