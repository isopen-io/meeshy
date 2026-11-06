package me.meeshy.app.chat

import androidx.compose.foundation.lazy.LazyListState
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.TestScope
import org.junit.Test

/**
 * #16465 — l'hôte du fil annonce chaque dépliage UNE fois, pour que l'aperçu de l'appui long (composé hors de la liste)
 * rende le message comme le fil le montre : déplié s'il l'a été.
 */
class LongMessageExpansionHostTest {

    private fun host(announced: MutableList<String>) =
        LongMessageExpansionHost(LazyListState(), TestScope(), onExpanded = { announced += it })

    @Test
    fun `deplier annonce le message et le garde deplie`() {
        val announced = mutableListOf<String>()
        val host = host(announced)

        host.expand("a", row = null)

        assertThat(host.isExpanded("a")).isTrue()
        assertThat(announced).containsExactly("a")
    }

    @Test
    fun `un second toucher n'annonce rien de plus, deux dépliés le restent`() {
        val announced = mutableListOf<String>()
        val host = host(announced)

        host.expand("a", row = null)
        host.expand("b", row = null)
        host.expand("a", row = null)

        assertThat(announced).containsExactly("a", "b").inOrder()
        assertThat(host.isExpanded("a")).isTrue()
        assertThat(host.isExpanded("b")).isTrue()
    }
}
