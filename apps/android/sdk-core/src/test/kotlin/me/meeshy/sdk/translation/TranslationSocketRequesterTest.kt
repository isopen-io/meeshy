package me.meeshy.sdk.translation

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.runBlocking
import me.meeshy.sdk.cache.CacheClock
import org.junit.Test

class TranslationSocketRequesterTest {

    private class FakeLink(var connected: Boolean) : TranslationSocketLink {
        val emitted = mutableListOf<Pair<String, String>>()
        val flow = MutableSharedFlow<Boolean>(replay = 1)
        override val isConnected: Boolean get() = connected
        override val connections: Flow<Boolean> = flow
        override fun emit(messageId: String, targetLanguage: String) {
            emitted += messageId to targetLanguage
        }
    }

    private class Clock(var now: Long = 0L) : CacheClock {
        override fun nowMillis(): Long = now
    }

    private fun requester(link: FakeLink, clock: Clock = Clock(), rest: suspend (String, String) -> Boolean = { _, _ -> true }) =
        TranslationSocketRequester(link, rest, clock, CoroutineScope(Dispatchers.Unconfined))

    @Test
    fun `socket connectee la demande part par la socket sans toucher au REST`() = runBlocking {
        val link = FakeLink(connected = true)
        var restCalls = 0
        val (route, ok) = requester(link) { _, _ -> restCalls++; true }.request("m1", "fr")
        assertThat(route).isEqualTo(TranslationRequestRoute.SOCKET)
        assertThat(ok).isTrue()
        assertThat(link.emitted).containsExactly("m1" to "fr")
        assertThat(restCalls).isEqualTo(0)
    }

    @Test
    fun `socket indisponible le REST prend le relais et la demande reste au tampon`() = runBlocking {
        val link = FakeLink(connected = false)
        val requester = requester(link) { id, language -> id == "m1" && language == "fr" }
        val (route, ok) = requester.request("m1", "fr")
        assertThat(route).isEqualTo(TranslationRequestRoute.REST_FALLBACK)
        assertThat(ok).isTrue()
        assertThat(link.emitted).isEmpty()
        assertThat(requester.pending()).hasSize(1)
    }

    @Test
    fun `la connexion rejoue les demandes fraiches et jette les perimees`() = runBlocking {
        val link = FakeLink(connected = false)
        val clock = Clock()
        val requester = requester(link, clock)
        requester.request("old", "fr")
        clock.now = 50_000
        requester.request("fresh", "es")
        clock.now = 70_000
        requester.attach()
        link.connected = true
        link.flow.emit(true)
        assertThat(link.emitted).containsExactly("fresh" to "es")
        assertThat(requester.pending()).isEmpty()
        requester.detach()
    }

    @Test
    fun `la meme demande deux fois n'est rejouee qu'une fois`() = runBlocking<Unit> {
        val link = FakeLink(connected = false)
        val requester = requester(link)
        requester.request("m1", "fr")
        requester.request("m1", "fr")
        requester.flush()
        assertThat(link.emitted).containsExactly("m1" to "fr")
    }

    @Test
    fun `une demande vide ne part nulle part`() = runBlocking {
        val link = FakeLink(connected = true)
        val (_, ok) = requester(link).request(" ", "fr")
        assertThat(ok).isFalse()
        assertThat(link.emitted).isEmpty()
    }
}
