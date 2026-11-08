package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import me.meeshy.sdk.model.mediacache.MediaTransferProfile
import org.junit.Test
import java.io.IOException
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicInteger

class SingleFlightDownloadsTest {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val flights = SingleFlightDownloads<String>(scope)
    private val immediate = MediaTransferProfile.STANDARD
    private val restricted = MediaTransferProfile.prefetch(meteredAllowed = false)

    private fun <T> blocking(block: suspend kotlinx.coroutines.CoroutineScope.() -> T): T = runBlocking { withTimeout(10_000) { block() } }

    @Test
    fun `deux appelants d'une meme cle partagent UNE tache et son resultat`() = blocking {
        val gate = CompletableDeferred<Unit>()
        val runs = AtomicInteger()
        val transfer: suspend (MediaTransferProfile, (Long, Long) -> Unit) -> String = { _, report ->
            runs.incrementAndGet()
            report(5, 10)
            gate.await()
            "bytes"
        }
        val firstSeen = CopyOnWriteArrayList<Long>()
        val secondSeen = CopyOnWriteArrayList<Long>()
        val first = async(Dispatchers.Default) { flights.run("k", immediate, { w, _ -> firstSeen += w }, transfer) }
        while (!flights.isInFlight("k")) kotlinx.coroutines.yield()
        val second = async(Dispatchers.Default) { flights.run("k", immediate, { w, _ -> secondSeen += w }, transfer) }
        Thread.sleep(100)
        gate.complete(Unit)
        assertThat(awaitAll(first, second)).containsExactly("bytes", "bytes")
        assertThat(runs.get()).isEqualTo(1)
        assertThat(firstSeen).contains(5L)
    }

    @Test
    fun `un appelant annule ne tue pas le transfert que les autres attendent`() = blocking {
        val gate = CompletableDeferred<Unit>()
        val transfer: suspend (MediaTransferProfile, (Long, Long) -> Unit) -> String = { _, _ -> gate.await(); "ok" }
        val leaver = async(Dispatchers.Default) { flights.run("k", immediate, transfer = transfer) }
        while (!flights.isInFlight("k")) kotlinx.coroutines.yield()
        val stayer = async(Dispatchers.Default) { flights.run("k", immediate, transfer = transfer) }
        Thread.sleep(100)
        leaver.cancelAndJoin()
        gate.complete(Unit)
        assertThat(stayer.await()).isEqualTo("ok")
    }

    @Test
    fun `le dernier appelant parti annule le transfert`() = blocking {
        val cancelled = CompletableDeferred<Boolean>()
        val transfer: suspend (MediaTransferProfile, (Long, Long) -> Unit) -> String = { _, _ ->
            try {
                CompletableDeferred<Unit>().await()
                "never"
            } catch (e: kotlinx.coroutines.CancellationException) {
                cancelled.complete(true)
                throw e
            }
        }
        val only = async(Dispatchers.Default) { flights.run("k", immediate, transfer = transfer) }
        while (!flights.isInFlight("k")) kotlinx.coroutines.yield()
        only.cancelAndJoin()
        assertThat(cancelled.await()).isTrue()
    }

    @Test
    fun `cancel annule le transfert pour tous les appelants`() = blocking {
        val transfer: suspend (MediaTransferProfile, (Long, Long) -> Unit) -> String = { _, _ -> CompletableDeferred<String>().await() }
        val caller = async(Dispatchers.Default) { runCatching { flights.run("k", immediate, transfer = transfer) } }
        while (!flights.isInFlight("k")) kotlinx.coroutines.yield()
        flights.cancel("k")
        assertThat(caller.await().exceptionOrNull()).isInstanceOf(SharedTransferCancelledException::class.java)
    }

    @Test
    fun `un transfert partage plus restreint qui echoue est repris avec le profil de l'appelant`() = blocking {
        val gate = CompletableDeferred<Unit>()
        val profiles = CopyOnWriteArrayList<MediaTransferProfile>()
        val transfer: suspend (MediaTransferProfile, (Long, Long) -> Unit) -> String = { opened, _ ->
            profiles += opened
            if (opened.covers(immediate)) {
                "bytes"
            } else {
                gate.await()
                throw IOException("network lost")
            }
        }
        val prefetch = async(Dispatchers.Default) { runCatching { flights.run("k", restricted, transfer = transfer) } }
        while (!flights.isInFlight("k")) kotlinx.coroutines.yield()
        val playback = async(Dispatchers.Default) { flights.run("k", immediate, transfer = transfer) }
        while (flights.requestedProfile("k") != immediate) kotlinx.coroutines.yield()
        gate.complete(Unit)
        assertThat(playback.await()).isEqualTo("bytes")
        assertThat(prefetch.await().exceptionOrNull()).isInstanceOf(IOException::class.java)
        assertThat(profiles).containsExactly(restricted, immediate).inOrder()
    }

    @Test
    fun `un media disparu ne se retente pas`() = blocking {
        val runs = AtomicInteger()
        val result = runCatching {
            flights.run("k", restricted) { _, _ ->
                runs.incrementAndGet()
                throw MediaGoneException(404)
            }
        }
        assertThat(result.exceptionOrNull()).isInstanceOf(MediaGoneException::class.java)
        assertThat(runs.get()).isEqualTo(1)
    }
}
