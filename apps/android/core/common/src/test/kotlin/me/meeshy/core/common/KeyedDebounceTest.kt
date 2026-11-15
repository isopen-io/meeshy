package me.meeshy.core.common

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Test

class KeyedDebounceTest {
    @Test
    fun `coalesce les appels d'une meme cle`() = runTest {
        val debounce = KeyedDebounce<String>(backgroundScope)
        val calls = mutableListOf<Int>()
        debounce.schedule("a", 100) { calls += 1 }
        advanceTimeBy(50)
        debounce.schedule("a", 100) { calls += 2 }
        advanceTimeBy(99); runCurrent()
        assertThat(calls).isEmpty()
        advanceTimeBy(2); runCurrent()
        assertThat(calls).containsExactly(2)
    }

    @Test
    fun `les cles independantes ne s'annulent pas`() = runTest {
        val debounce = KeyedDebounce<String>(backgroundScope)
        val calls = mutableListOf<String>()
        debounce.schedule("a", 100) { calls += "a" }
        debounce.schedule("b", 100) { calls += "b" }
        advanceTimeBy(101); runCurrent()
        assertThat(calls).containsExactly("a", "b")
    }

    @Test
    fun `cancel retire l'action en attente`() = runTest {
        val debounce = KeyedDebounce<String>(backgroundScope)
        var fired = false
        debounce.schedule("a", 100) { fired = true }
        debounce.cancel("a")
        advanceTimeBy(200); runCurrent()
        assertThat(fired).isFalse()
    }
}
