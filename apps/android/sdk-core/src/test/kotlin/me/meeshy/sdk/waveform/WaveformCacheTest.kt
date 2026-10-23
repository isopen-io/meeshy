package me.meeshy.sdk.waveform

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.waveform.WaveformLocation
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/**
 * **La mesure d'une forme d'onde, une fois, partout.** Calcul unique, mémoire FIFO bornée, disque
 * durable, annulation quand le dernier demandeur part. Le décodeur est un faux : ce qui se prouve
 * ici est le cache, pas l'audio (voir `WaveformExtractorTest`).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class WaveformCacheTest {

    @get:Rule
    val folder = TemporaryFolder()

    private class FakeMeasurer(private val values: (WaveformLocation, Int) -> FloatArray = { _, count -> FloatArray(count) { 0.5f } }) :
        WaveformMeasuring {
        val calls = mutableListOf<Pair<WaveformLocation, Int>>()
        val existedAtCall = mutableListOf<Boolean>()
        var gate: CompletableDeferred<Unit>? = null
        var cancelled = 0

        override suspend fun measure(location: WaveformLocation, count: Int): FloatArray {
            calls += location to count
            existedAtCall += (location as? WaveformLocation.Local)?.let { File(it.path).exists() } ?: false
            try {
                gate?.await()
                return values(location, count)
            } catch (cancellation: CancellationException) {
                cancelled++
                throw cancellation
            }
        }
    }

    private fun TestScope.cache(
        measurer: WaveformMeasuring,
        directory: File = File(folder.root, "waveforms"),
        memoryCapacity: Int = 300,
        maxConcurrentMeasures: Int = 2,
    ) = WaveformCache(directory, measurer, StandardTestDispatcher(testScheduler), memoryCapacity, maxConcurrentMeasures)

    private fun audio(name: String, seed: Int, size: Int = 4_000, directory: String = "audio"): WaveformLocation.Local {
        val dir = File(folder.root, directory).apply { mkdirs() }
        val file = File(dir, name).apply { writeBytes(ByteArray(size) { ((it * 31 + seed) and 0xFF).toByte() }) }
        return WaveformLocation.Local(file.path)
    }

    @Test
    fun `un meme releve demande deux fois ne se calcule qu'une fois`() = runTest {
        val measurer = FakeMeasurer()
        val cache = cache(measurer)
        val voice = audio("voice.m4a", seed = 1)

        val first = cache.samples(voice, 96)
        val second = cache.samples(voice, 96)

        assertThat(measurer.calls).hasSize(1)
        assertThat(first).hasSize(96)
        assertThat(second).isEqualTo(first)
    }

    @Test
    fun `deux demandes simultanees partagent une seule mesure`() = runTest {
        val measurer = FakeMeasurer().apply { gate = CompletableDeferred() }
        val cache = cache(measurer)
        val voice = audio("voice.m4a", seed = 1)

        val a = async { cache.samples(voice, 512) }
        val b = async { cache.samples(voice, 512) }
        runCurrent()
        measurer.gate!!.complete(Unit)

        assertThat(a.await()).isEqualTo(b.await())
        assertThat(measurer.calls).hasSize(1)
    }

    @Test
    fun `un meme son sous deux noms ne se calcule qu'une fois`() = runTest {
        val measurer = FakeMeasurer()
        val cache = cache(measurer)
        val original = audio("voice.m4a", seed = 1)
        val copy = audio("autre-nom.m4a", seed = 1, directory = "copies")

        cache.samples(original, 96)
        cache.samples(copy, 96)

        assertThat(measurer.calls).hasSize(1)
    }

    @Test
    fun `deux recording m4a de contenus differents se calculent chacun`() = runTest {
        val measurer = FakeMeasurer { location, count -> FloatArray(count) { if ((location as WaveformLocation.Local).path.contains("quiet")) 0.1f else 0.9f } }
        val cache = cache(measurer)
        val quiet = audio("recording.m4a", seed = 1, directory = "quiet")
        val loud = audio("recording.m4a", seed = 2, directory = "loud")

        val quietPeak = cache.samples(quiet, 64).max()
        val loudPeak = cache.samples(loud, 64).max()

        assertThat(measurer.calls).hasSize(2)
        assertThat(loudPeak).isGreaterThan(quietPeak * 3)
    }

    @Test
    fun `la voie octets et la voie fichier partagent le releve`() = runTest {
        val measurer = FakeMeasurer()
        val cache = cache(measurer)
        val voice = audio("voice.m4a", seed = 5, size = 150_000)

        val fromFile = cache.samples(voice, 96)
        val fromBytes = cache.samples(File(voice.path).readBytes(), 96)

        assertThat(measurer.calls).hasSize(1)
        assertThat(fromBytes).isEqualTo(fromFile)
    }

    @Test
    fun `l'audio en memoire est mesure sur une copie temporaire qui disparait ensuite`() = runTest {
        val measurer = FakeMeasurer()
        val cache = cache(measurer)

        cache.samples(ByteArray(2_000) { it.toByte() }, 80)

        val copy = (measurer.calls.single().first as WaveformLocation.Local).path
        assertThat(measurer.existedAtCall.single()).isTrue()
        assertThat(File(copy).exists()).isFalse()
    }

    @Test
    fun `des tailles differentes sont des entrees differentes`() = runTest {
        val measurer = FakeMeasurer()
        val cache = cache(measurer)
        val voice = audio("voice.m4a", seed = 1)

        cache.samples(voice, 96)
        cache.samples(voice, 512)
        cache.samples(voice, 2_048)

        assertThat(measurer.calls.map { it.second }).containsExactly(96, 512, 2_048).inOrder()
    }

    @Test
    fun `la memoire evince le plus ancien inserer, pas le moins recent lu`() = runTest {
        val measurer = FakeMeasurer()
        val directory = File(folder.root, "waveforms")
        val cache = cache(measurer, directory, memoryCapacity = 2)
        val a = audio("a.m4a", seed = 1)
        val b = audio("b.m4a", seed = 2)
        val c = audio("c.m4a", seed = 3)

        cache.samples(a, 96)
        cache.samples(b, 96)
        cache.samples(a, 96)
        cache.samples(c, 96)
        directory.deleteRecursively()
        measurer.calls.clear()
        cache.samples(b, 96)
        cache.samples(c, 96)
        val afterSurvivors = measurer.calls.size
        cache.samples(a, 96)

        assertThat(afterSurvivors).isEqualTo(0)
        assertThat(measurer.calls).hasSize(1)
    }

    @Test
    fun `le disque rend le releve a une nouvelle instance, sans decoder`() = runTest {
        val directory = File(folder.root, "waveforms")
        val voice = audio("voice.m4a", seed = 1)
        val measurer = FakeMeasurer { _, count -> FloatArray(count) { it / count.toFloat() } }
        val written = cache(measurer, directory).samples(voice, 128)

        val reopened = FakeMeasurer()
        val fromDisk = cache(reopened, directory).samples(voice, 128)

        assertThat(reopened.calls).isEmpty()
        assertThat(fromDisk).isEqualTo(written)
    }

    @Test
    fun `la memoire videe, le disque rend le releve a l'octet pres`() = runTest {
        val measurer = FakeMeasurer { _, count -> FloatArray(count) { (it * 7 % 13) / 13f } }
        val cache = cache(measurer)
        val voice = audio("voice.m4a", seed = 1)
        val measured = cache.samples(voice, 80)

        cache.clearMemoryCache()
        val fromDisk = cache.samples(voice, 80)

        assertThat(measurer.calls).hasSize(1)
        assertThat(fromDisk).isEqualTo(measured)
    }

    @Test
    fun `un fichier de cache corrompu est remesure`() = runTest {
        val directory = File(folder.root, "waveforms")
        val measurer = FakeMeasurer()
        val cache = cache(measurer, directory)
        val voice = audio("voice.m4a", seed = 1)
        cache.samples(voice, 80)
        directory.listFiles { file -> file.extension == "waveform" }!!.forEach { it.writeBytes(byteArrayOf(1, 2, 3)) }
        cache.clearMemoryCache()

        cache.samples(voice, 80)

        assertThat(measurer.calls).hasSize(2)
    }

    @Test
    fun `un releve vide ne se retient pas, le prochain appel retente`() = runTest {
        val measurer = FakeMeasurer { _, _ -> FloatArray(0) }
        val cache = cache(measurer)
        val voice = audio("voice.m4a", seed = 1)

        assertThat(cache.samples(voice, 96)).isEmpty()
        assertThat(cache.samples(voice, 96)).isEmpty()

        assertThat(measurer.calls).hasSize(2)
    }

    @Test
    fun `un nombre de compartiments nul ne mesure rien`() = runTest {
        val measurer = FakeMeasurer()

        assertThat(cache(measurer).samples(audio("voice.m4a", seed = 1), 0)).isEmpty()
        assertThat(measurer.calls).isEmpty()
    }

    @Test
    fun `quand le seul demandeur part, la mesure est annulee`() = runTest {
        val measurer = FakeMeasurer().apply { gate = CompletableDeferred() }
        val cache = cache(measurer)
        val voice = audio("voice.m4a", seed = 1)

        val bubble = launch { cache.samples(voice, 96) }
        runCurrent()
        bubble.cancelAndJoin()
        advanceUntilIdle()

        assertThat(measurer.cancelled).isEqualTo(1)
    }

    @Test
    fun `tant qu'un demandeur reste, la mesure continue`() = runTest {
        val measurer = FakeMeasurer().apply { gate = CompletableDeferred() }
        val cache = cache(measurer)
        val voice = audio("voice.m4a", seed = 1)

        val leaving = launch { cache.samples(voice, 96) }
        val staying = async { cache.samples(voice, 96) }
        runCurrent()
        leaving.cancelAndJoin()
        runCurrent()
        measurer.gate!!.complete(Unit)

        assertThat(staying.await()).hasSize(96)
        assertThat(measurer.cancelled).isEqualTo(0)
        assertThat(measurer.calls).hasSize(1)
    }

    @Test
    fun `une mesure annulee ne laisse rien en cache, la bulle suivante la refait`() = runTest {
        val measurer = FakeMeasurer().apply { gate = CompletableDeferred() }
        val cache = cache(measurer)
        val voice = audio("voice.m4a", seed = 1)
        val bubble = launch { cache.samples(voice, 96) }
        runCurrent()
        bubble.cancelAndJoin()
        advanceUntilIdle()
        measurer.gate = null

        val again = cache.samples(voice, 96)

        assertThat(again).hasSize(96)
        assertThat(measurer.calls).hasSize(2)
    }

    @Test
    fun `au plus deux decodages a la fois`() = runTest {
        val measurer = FakeMeasurer().apply { gate = CompletableDeferred() }
        val cache = cache(measurer, maxConcurrentMeasures = 2)
        val sounds = (1..4).map { audio("v$it.m4a", seed = it) }

        val pending = sounds.map { async { cache.samples(it, 96) } }
        runCurrent()
        val startedBeforeRelease = measurer.calls.size
        measurer.gate!!.complete(Unit)
        pending.forEach { it.await() }

        assertThat(startedBeforeRelease).isEqualTo(2)
        assertThat(measurer.calls).hasSize(4)
    }

    @Test
    fun `tout vider efface la memoire et le disque`() = runTest {
        val directory = File(folder.root, "waveforms")
        val measurer = FakeMeasurer()
        val cache = cache(measurer, directory)
        val voice = audio("voice.m4a", seed = 1)
        cache.samples(voice, 96)

        cache.clearAll()
        cache.samples(voice, 96)

        assertThat(measurer.calls).hasSize(2)
    }

    @Test
    fun `une adresse distante est clee par son adresse`() = runTest {
        val measurer = FakeMeasurer()
        val cache = cache(measurer)
        val remote = WaveformLocation.Remote("https://cdn.meeshy.me/a.m4a")

        cache.samples(remote, 96)
        cache.samples(remote, 96)
        cache.samples(WaveformLocation.Remote("https://cdn.meeshy.me/b.m4a"), 96)

        assertThat(measurer.calls).hasSize(2)
    }
}
