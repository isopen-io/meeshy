package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ConversationListPrewarmerTest {

    @Test
    fun `l authentification lance une synchro et l absence de compte n en lance aucune`() = runTest {
        val accounts = MutableStateFlow<String?>(null)
        var syncs = 0
        val job = ConversationListPrewarmer({ syncs++; true }, this).start(accounts)
        runCurrent()
        assertThat(syncs).isEqualTo(0)

        accounts.value = "alice"
        runCurrent()

        assertThat(syncs).isEqualTo(1)
        job.cancel()
    }

    @Test
    fun `un changement de compte annule le prechauffage en cours`() = runTest {
        val accounts = MutableStateFlow<String?>("alice")
        val gate = CompletableDeferred<Unit>()
        val finished = mutableListOf<String>()
        var current: String? = null
        val job = ConversationListPrewarmer(
            sync = {
                val owner = accounts.value
                current = owner
                if (owner == "alice") gate.await()
                finished += owner.orEmpty()
                true
            },
            scope = this,
        ).start(accounts)
        runCurrent()
        assertThat(current).isEqualTo("alice")

        accounts.value = "bob"
        runCurrent()
        gate.complete(Unit)
        runCurrent()

        assertThat(finished).containsExactly("bob")
        job.cancel()
    }

    @Test
    fun `le meme compte republie ne relance pas de synchro`() = runTest {
        val accounts = MutableStateFlow<String?>("alice")
        var syncs = 0
        val job = ConversationListPrewarmer({ syncs++; true }, this).start(accounts)
        runCurrent()

        accounts.value = "alice"
        runCurrent()

        assertThat(syncs).isEqualTo(1)
        job.cancel()
    }
}
