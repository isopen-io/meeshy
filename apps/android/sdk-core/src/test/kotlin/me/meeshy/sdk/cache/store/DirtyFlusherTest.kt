package me.meeshy.sdk.cache.store

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class DirtyFlusherTest {

    private fun TestScope.flusher() = DirtyFlusher(this, debounceMillis = 1_000)

    @Test fun `le dirty-set se vide apres le debounce`() = runTest {
        val flusher = flusher()
        val ran = mutableListOf<String>()
        flusher.markDirty("a") { ran += "a" }

        advanceTimeBy(999); runCurrent()
        assertThat(ran).isEmpty()
        advanceTimeBy(2); runCurrent()
        assertThat(ran).containsExactly("a")
        assertThat(flusher.pendingIds()).isEmpty()
    }

    @Test fun `une nouvelle ecriture repousse le debounce`() = runTest {
        val flusher = flusher()
        val ran = mutableListOf<String>()
        flusher.markDirty("a") { ran += "a" }
        advanceTimeBy(800)
        flusher.markDirty("b") { ran += "b" }
        advanceTimeBy(800); runCurrent()
        assertThat(ran).isEmpty()
        advanceTimeBy(300); runCurrent()
        assertThat(ran).containsExactly("a", "b")
    }

    @Test fun `flushAll respecte l ordre de criticite`() = runTest {
        val flusher = flusher()
        val ran = mutableListOf<String>()
        flusher.markDirty("low", CacheCriticality.LOW) { ran += "low" }
        flusher.markDirty("normal", CacheCriticality.NORMAL) { ran += "normal" }
        flusher.markDirty("critical", CacheCriticality.CRITICAL) { ran += "critical" }

        val flushed = flusher.flushAll(deadlineMillis = 5_000)

        assertThat(ran).containsExactly("critical", "normal", "low").inOrder()
        assertThat(flushed).isEqualTo(3)
    }

    @Test fun `flushAll s arrete a l echeance et garde le reste inscrit`() = runTest {
        val flusher = flusher()
        val ran = mutableListOf<String>()
        flusher.markDirty("critical", CacheCriticality.CRITICAL) { delay(100); ran += "critical" }
        flusher.markDirty("low", CacheCriticality.LOW) { delay(1_000); ran += "low" }

        flusher.flushAll(deadlineMillis = 500)

        assertThat(ran).containsExactly("critical")
        assertThat(flusher.pendingIds()).containsExactly("low")
    }

    @Test fun `un rejeu qui echoue reste inscrit et n empeche pas les autres`() = runTest {
        val flusher = flusher()
        val ran = mutableListOf<String>()
        flusher.markDirty("bad", CacheCriticality.CRITICAL) { error("disk full") }
        flusher.markDirty("ok", CacheCriticality.NORMAL) { ran += "ok" }

        flusher.flushAll(deadlineMillis = 5_000)

        assertThat(ran).containsExactly("ok")
        assertThat(flusher.pendingIds()).containsExactly("bad")
    }
}
