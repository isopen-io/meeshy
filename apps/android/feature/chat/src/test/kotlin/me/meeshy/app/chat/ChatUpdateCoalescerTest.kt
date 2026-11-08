package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiTextTranslation
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ChatUpdateCoalescerTest {

    private fun message(id: String, translations: Int = 0, content: String = "hi") = LocalMessage(
        ApiMessage(
            id = id,
            conversationId = "c",
            content = content,
            translations = List(translations) { ApiTextTranslation(targetLanguage = "l$it", translatedContent = "t$it") },
        ),
    )

    private fun window(vararg messages: LocalMessage): CacheResult<List<LocalMessage>> = CacheResult.Fresh(messages.toList(), 0)

    private fun enriched(previous: CacheResult<List<LocalMessage>>?, next: CacheResult<List<LocalMessage>>) =
        ChatUpdateCoalescer.enrichedIds(previous, next)

    @Test
    fun `vingt traductions en moins de 80 ms produisent une seule emission`() = runTest {
        val upstream = MutableSharedFlow<CacheResult<List<LocalMessage>>>(extraBufferCapacity = 64)
        val gate = ChatListUpdateGate()
        val seen = mutableListOf<CacheResult<List<LocalMessage>>>()
        val job = launch { upstream.coalesced(gate, enriched = ::enriched).collect { seen += it } }
        runCurrent()
        upstream.emit(window(message("a"), message("b")))
        runCurrent()
        assertThat(seen).hasSize(1)
        repeat(20) {
            upstream.emit(window(message("a", translations = it + 1), message("b")))
            advanceTimeBy(3)
            runCurrent()
        }
        assertThat(seen).hasSize(1)
        advanceTimeBy(ChatUpdateCoalescer.WINDOW_MS)
        runCurrent()
        assertThat(seen).hasSize(2)
        assertThat((seen.last() as CacheResult.Fresh).value[0].message.translations).hasSize(20)
        job.cancel()
    }

    @Test
    fun `une rafale suivante ouvre sa propre fenetre`() = runTest {
        val upstream = MutableSharedFlow<CacheResult<List<LocalMessage>>>(extraBufferCapacity = 64)
        val seen = mutableListOf<CacheResult<List<LocalMessage>>>()
        val job = launch { upstream.coalesced(ChatListUpdateGate(), enriched = ::enriched).collect { seen += it } }
        runCurrent()
        upstream.emit(window(message("a")))
        upstream.emit(window(message("a", 1)))
        advanceTimeBy(100)
        runCurrent()
        upstream.emit(window(message("a", 2)))
        advanceTimeBy(100)
        runCurrent()
        assertThat(seen).hasSize(3)
        job.cancel()
    }

    @Test
    fun `un changement structurel s applique aussitot`() = runTest {
        val upstream = MutableSharedFlow<CacheResult<List<LocalMessage>>>(extraBufferCapacity = 64)
        val seen = mutableListOf<CacheResult<List<LocalMessage>>>()
        val job = launch { upstream.coalesced(ChatListUpdateGate(), enriched = ::enriched).collect { seen += it } }
        runCurrent()
        upstream.emit(window(message("a")))
        upstream.emit(window(message("a"), message("b")))
        runCurrent()
        assertThat(seen).hasSize(2)
        upstream.emit(window(message("a", content = "edited"), message("b")))
        runCurrent()
        assertThat(seen).hasSize(3)
        job.cancel()
    }

    @Test
    fun `pendant le geste rien n est applique puis le dernier etat est rejoue a l arret`() = runTest {
        val upstream = MutableSharedFlow<CacheResult<List<LocalMessage>>>(extraBufferCapacity = 64)
        val gate = ChatListUpdateGate()
        val seen = mutableListOf<CacheResult<List<LocalMessage>>>()
        val job = launch { upstream.coalesced(gate, enriched = ::enriched).collect { seen += it } }
        runCurrent()
        upstream.emit(window(message("a"), message("b")))
        runCurrent()
        gate.setScrolling(true)
        runCurrent()
        upstream.emit(window(message("a", 1), message("b")))
        upstream.emit(window(message("a", 1), message("b", 2)))
        advanceTimeBy(1_000)
        runCurrent()
        assertThat(seen).hasSize(1)
        gate.setScrolling(false)
        runCurrent()
        assertThat(seen).hasSize(2)
        val last = (seen.last() as CacheResult.Fresh).value
        assertThat(last.map { it.message.translations.size }).containsExactly(1, 2).inOrder()
        job.cancel()
    }

    @Test
    fun `la liste endormie neutralise meme un changement structurel puis le rejoue au reveil`() = runTest {
        val upstream = MutableSharedFlow<CacheResult<List<LocalMessage>>>(extraBufferCapacity = 64)
        val gate = ChatListUpdateGate()
        val seen = mutableListOf<CacheResult<List<LocalMessage>>>()
        val job = launch { upstream.coalesced(gate, enriched = ::enriched).collect { seen += it } }
        runCurrent()
        upstream.emit(window(message("a")))
        runCurrent()
        gate.setAsleep(true)
        runCurrent()
        upstream.emit(window(message("a"), message("b")))
        advanceUntilIdle()
        assertThat(seen).hasSize(1)
        gate.setAsleep(false)
        runCurrent()
        assertThat(seen).hasSize(2)
        job.cancel()
    }

    @Test
    fun `enrichedIds ne rend que les lignes dont seule la traduction a bouge`() {
        val before = window(message("a"), message("b"))
        assertThat(enriched(before, window(message("a"), message("b", 1)))).containsExactly("b")
        assertThat(enriched(before, window(message("a"), message("b")))).isNull()
        assertThat(enriched(before, window(message("a"), message("c")))).isNull()
        assertThat(enriched(null, before)).isNull()
        assertThat(enriched(before, CacheResult.Stale(listOf(message("a"), message("b", 1)), 0))).isNull()
    }
}
