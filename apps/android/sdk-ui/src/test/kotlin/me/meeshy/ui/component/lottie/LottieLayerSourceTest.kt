package me.meeshy.ui.component.lottie

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.pack.PackAssetRef
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.util.concurrent.atomic.AtomicInteger

@RunWith(RobolectricTestRunner::class)
class LottieLayerSourceTest {
    private val bytes = EMPTY_FILM_JSON.toByteArray()
    private val sha = LottieLayerSource.sha256Hex(bytes)
    private fun ref(sha256: String = sha) = PackAssetRef.of("${sha256.take(16)}.json", bytes.size.toLong(), sha256)!!

    private class Counting(val data: ByteArray?, val gate: CompletableDeferred<Unit>? = null) : PackFileReader {
        val reads = AtomicInteger()
        override suspend fun read(ref: PackAssetRef): ByteArray? {
            reads.incrementAndGet()
            gate?.await()
            return data
        }
    }

    private fun source(reader: PackFileReader, decodes: AtomicInteger = AtomicInteger()) =
        LottieLayerSource(reader, decoder = { decodes.incrementAndGet(); LottieLayerSource.decodeFilm(it) })

    @Test fun `un fichier a l'empreinte juste se lit en film`() = runTest {
        assertThat(source(Counting(bytes)).film(ref())).isNotNull()
    }

    @Test fun `une empreinte alteree ne se lit pas`() = runTest {
        val tampered = Counting(bytes + 32)
        assertThat(source(tampered).film(ref())).isNull()
    }

    @Test fun `des demandes simultanees partagent une lecture et un decodage`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val reader = Counting(bytes, gate)
        val decodes = AtomicInteger()
        val src = source(reader, decodes)
        val films = List(30) { async { src.film(ref()) } }
        advanceUntilIdle()
        gate.complete(Unit)
        val results = films.map { it.await() }
        assertThat(reader.reads.get()).isEqualTo(1)
        assertThat(decodes.get()).isEqualTo(1)
        assertThat(results.toSet()).hasSize(1)
    }

    @Test fun `le film lu est gardé en memoire par empreinte`() = runTest {
        val reader = Counting(bytes)
        val src = source(reader)
        val first = src.film(ref())
        assertThat(src.cached(ref())).isSameInstanceAs(first)
        assertThat(src.film(ref())).isSameInstanceAs(first)
        assertThat(reader.reads.get()).isEqualTo(1)
    }

    @Test fun `un fichier illisible efface la couche sans lever`() = runTest {
        val garbage = "pas du json".toByteArray()
        val g = LottieLayerSource.sha256Hex(garbage)
        val r = PackAssetRef.of("${g.take(16)}.json", garbage.size.toLong(), g)!!
        assertThat(source(Counting(garbage)).film(r)).isNull()
        assertThat(source(Counting(null)).film(ref())).isNull()
    }
}
