package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ChatListQuiescenceTest {

    private fun window(vararg ids: String): CacheResult<List<LocalMessage>> =
        CacheResult.Fresh(ids.map { LocalMessage(ApiMessage(id = it, conversationId = "c", content = "hi")) }, 0)

    @Test
    fun `le fil se voit sauf sous le Resume et la Riviere ouverte`() {
        assertThat(ChatListQuiescence.rendersThread(null)).isTrue()
        assertThat(ChatListQuiescence.rendersThread(ConversationReadingMode.BUBBLES)).isTrue()
        assertThat(ChatListQuiescence.rendersThread(ConversationReadingMode.FOCAL)).isTrue()
        assertThat(ChatListQuiescence.rendersThread(ConversationReadingMode.SUMMARY)).isFalse()
        assertThat(ChatListQuiescence.rendersThread(ConversationReadingMode.RIVER, riverOpen = true)).isFalse()
        assertThat(ChatListQuiescence.rendersThread(ConversationReadingMode.RIVER, riverOpen = false)).isTrue()
    }

    @Test
    fun `le mode de lecture de la liste vaut Bulles par defaut`() {
        assertThat(ChatReadingMode.Default).isEqualTo(ChatReadingMode.Bubbles)
        ConversationReadingMode.entries.forEach {
            assertThat(ChatReadingMode.of(it)).isEqualTo(ChatReadingMode.Bubbles)
        }
    }

    @Test
    fun `endormie la liste n applique rien, accumule, puis rejoue l etat courant au reveil`() = runTest {
        val upstream = MutableSharedFlow<CacheResult<List<LocalMessage>>>(extraBufferCapacity = 64)
        val gate = ChatListUpdateGate()
        val seen = mutableListOf<CacheResult<List<LocalMessage>>>()
        val job = launch { upstream.coalesced(gate, enriched = ChatUpdateCoalescer::enrichedIds).collect { seen += it } }
        runCurrent()
        upstream.emit(window("a"))
        runCurrent()
        assertThat(seen).hasSize(1)

        gate.setAsleep(true)
        runCurrent()
        upstream.emit(window("a", "b"))
        upstream.emit(window("a", "b", "c"))
        advanceTimeBy(ChatUpdateCoalescer.WINDOW_MS * 4)
        runCurrent()
        assertThat(seen).hasSize(1)

        gate.setAsleep(false)
        runCurrent()
        assertThat(seen).hasSize(2)
        assertThat(seen.last()).isEqualTo(window("a", "b", "c"))
        job.cancel()
    }

    @Test
    fun `sous couverture une valeur inutile est ignoree et une valeur utile passe`() {
        val filter = CoveredUpdateFilter()
        val covered = CoveredListInputs(covered = true, currentUserId = "u")
        assertThat(filter.accept(covered)).isTrue()
        assertThat(filter.accept(covered.copy())).isFalse()
        assertThat(filter.accept(covered.copy(scrollToBottomTrigger = 1))).isTrue()
        assertThat(filter.accept(covered.copy(scrollToBottomTrigger = 1))).isFalse()
        assertThat(filter.accept(covered.copy(scrollToBottomTrigger = 1, covered = false))).isTrue()
        assertThat(filter.accept(covered.copy(scrollToBottomTrigger = 1, covered = false))).isTrue()
    }
}
