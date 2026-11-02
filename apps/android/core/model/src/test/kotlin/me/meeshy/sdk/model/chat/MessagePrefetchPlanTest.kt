package me.meeshy.sdk.model.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationLastMessage
import org.junit.Test

class MessagePrefetchPlanTest {

    private fun conversation(id: String, lastId: String? = "m-$id", at: String? = "2026-10-01T10:00:00.000Z") =
        ApiConversation(id = id, lastMessage = ApiConversationLastMessage(id = lastId, createdAt = at))

    private fun candidate(lastId: String? = "m1", at: Long = 1_000L) =
        PrefetchCandidate("c1", lastId, at)

    private fun held(count: Int, ids: Set<String> = emptySet(), newest: Long? = null) =
        HeldMessageWindow(count, ids, newest)

    @Test
    fun `les cibles sont les vingt premieres lignes a identifiant non vide`() {
        val rows = listOf(conversation("")) + (1..25).map { conversation("c$it") }
        val targets = MessagePrefetchPlan.targets(rows)
        assertThat(targets).hasSize(20)
        assertThat(targets.first().conversationId).isEqualTo("c1")
        assertThat(targets.last().conversationId).isEqualTo("c20")
    }

    @Test
    fun `sans identifiant de message la marque derive de l horloge`() {
        val target = MessagePrefetchPlan.targets(listOf(conversation("c1", lastId = null))).single()
        assertThat(target.latestMark).startsWith("@")
        assertThat(candidate(lastId = null, at = 42).latestMark).isEqualTo("@42")
    }

    @Test
    fun `une base vide demande la passe`() {
        assertThat(MessagePrefetchPlan.needsPrefetch(candidate(), HeldMessageWindow.EMPTY, null)).isTrue()
    }

    @Test
    fun `une base qui detient le dernier message et un ecran est sautee`() {
        val window = held(20, setOf("m1"), 1_000L)
        assertThat(MessagePrefetchPlan.needsPrefetch(candidate(), window, null)).isFalse()
    }

    @Test
    fun `le dernier message seul ne suffit pas a remplir un ecran`() {
        val window = held(1, setOf("m1"), 1_000L)
        assertThat(MessagePrefetchPlan.needsPrefetch(candidate(), window, null)).isTrue()
    }

    @Test
    fun `une fenetre pleine mais en retard sur la ligne est rechargee`() {
        val window = held(25, setOf("m0"), 500L)
        assertThat(MessagePrefetchPlan.needsPrefetch(candidate(), window, null)).isTrue()
    }

    @Test
    fun `une fenetre pleine plus recente que la ligne compte comme detenue`() {
        val window = held(25, setOf("m9"), 2_000L)
        assertThat(MessagePrefetchPlan.needsPrefetch(candidate(), window, null)).isFalse()
    }

    @Test
    fun `une passe reussie sur ce dernier message saute la conversation courte`() {
        val short = held(3, setOf("m1"), 1_000L)
        assertThat(MessagePrefetchPlan.needsPrefetch(candidate(), short, "m1")).isFalse()
        assertThat(MessagePrefetchPlan.needsPrefetch(candidate(), short, "m0")).isTrue()
    }

    @Test
    fun `le registre est cle par compte et conversation`() {
        assertThat(MessagePrefetchPlan.ledgerKey("u", "c")).isEqualTo("u|c")
    }
}
