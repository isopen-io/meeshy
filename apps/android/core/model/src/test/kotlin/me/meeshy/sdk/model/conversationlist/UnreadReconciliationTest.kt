package me.meeshy.sdk.model.conversationlist

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class UnreadReconciliationTest {

    @Test
    fun `la conversation ouverte est ramenee a zero`() {
        val reconciled = UnreadReconciliation.reconcile(
            rows = listOf(UnreadRow("open", 4), UnreadRow("other", 2)),
            openConversationId = "open",
            explicitlyUnread = emptySet(),
        )

        assertThat(reconciled).containsExactly(UnreadRow("open", 0), UnreadRow("other", 2)).inOrder()
    }

    @Test
    fun `une marque non lu explicite survit a un serveur qui la dit lue`() {
        val reconciled = UnreadReconciliation.reconcile(
            rows = listOf(UnreadRow("marked", 0)),
            openConversationId = null,
            explicitlyUnread = setOf("marked"),
        )

        assertThat(reconciled).containsExactly(UnreadRow("marked", 1))
    }

    @Test
    fun `une marque explicite l emporte meme sur la conversation ouverte`() {
        val reconciled = UnreadReconciliation.reconcile(
            rows = listOf(UnreadRow("open", 3)),
            openConversationId = "open",
            explicitlyUnread = setOf("open"),
        )

        assertThat(reconciled).containsExactly(UnreadRow("open", 3))
    }

    @Test
    fun `seules les lignes qui changent sont a reecrire`() {
        val corrections = UnreadReconciliation.corrections(
            rows = listOf(UnreadRow("open", 2), UnreadRow("same", 5), UnreadRow("marked", 0)),
            openConversationId = "open",
            explicitlyUnread = setOf("marked"),
        )

        assertThat(corrections).containsExactly(UnreadRow("open", 0), UnreadRow("marked", 1)).inOrder()
    }

    @Test
    fun `la fermeture du detail ouvert rattrape la lecture sauf apres un marquer non lu`() {
        assertThat(UnreadReconciliation.exitCatchesUp("c1", explicitlyUnread = emptySet())).isTrue()
        assertThat(UnreadReconciliation.exitCatchesUp("c1", explicitlyUnread = setOf("c1"))).isFalse()
    }
}
