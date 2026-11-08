package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ChatLifecycleHooksTest {
    @Test
    fun `fireStop declenche chaque crochet dans l'ordre d'inscription`() {
        val calls = mutableListOf<String>()
        val hooks = ChatLifecycleHooks()
        hooks.onStop("draft") { calls += "draft" }
        hooks.onStop("voice") { calls += "voice" }
        hooks.fireStop()
        assertThat(calls).containsExactly("draft", "voice").inOrder()
    }

    @Test
    fun `un crochet qui echoue n'empeche pas les suivants`() {
        val calls = mutableListOf<String>()
        val hooks = ChatLifecycleHooks()
        hooks.onStop("a") { error("boom") }
        hooks.onStop("b") { calls += "b" }
        hooks.fireStop()
        assertThat(calls).containsExactly("b")
    }

    @Test
    fun `un crochet retire ne se declenche plus et reinscrire remplace`() {
        val calls = mutableListOf<String>()
        val hooks = ChatLifecycleHooks()
        val remove = hooks.onStop("a") { calls += "a1" }
        hooks.onStop("b") { calls += "b1" }
        hooks.onStop("b") { calls += "b2" }
        remove()
        hooks.fireStop()
        assertThat(calls).containsExactly("b2")
    }
}
