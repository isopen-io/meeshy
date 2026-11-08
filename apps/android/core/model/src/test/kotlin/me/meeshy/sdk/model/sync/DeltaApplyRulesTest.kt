package me.meeshy.sdk.model.sync

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import org.junit.Test

class DeltaApplyRulesTest {

    private fun cached(id: String) = ApiConversation(id = id, type = "group", title = "T-$id")

    private fun row(id: String, isActive: Boolean? = true) =
        SyncConversationRow(id = id, type = "group", title = "Nouveau-$id", isActive = isActive)

    @Test
    fun `un tombstone s applique apres les upserts de la meme conversation`() {
        val applied = DeltaApplyRules.apply(
            existing = mapOf("c1" to cached("c1")),
            rows = listOf(row("c1")),
            tombstoneIds = listOf("c1"),
        )
        assertThat(applied.merge.upserts).isEmpty()
        assertThat(applied.merge.removedIds).containsExactly("c1")
        assertThat(applied.invalidatedMessageIds).containsExactly("c1")
    }

    @Test
    fun `une ligne inactive retire la conversation et invalide ses messages`() {
        val applied = DeltaApplyRules.apply(
            existing = mapOf("c1" to cached("c1"), "c2" to cached("c2")),
            rows = listOf(row("c1", isActive = false), row("c2")),
            tombstoneIds = emptyList(),
        )
        assertThat(applied.merge.upserts.map { it.id }).containsExactly("c2")
        assertThat(applied.invalidatedMessageIds).containsExactly("c1")
    }

    @Test
    fun `un tombstone d une conversation inconnue est tout de meme retire sans doublon`() {
        val applied = DeltaApplyRules.apply(emptyMap(), emptyList(), listOf("x", "x"))
        assertThat(applied.invalidatedMessageIds).containsExactly("x")
    }

    @Test
    fun `un delta tronque ou troue n est jamais pris pour complet`() {
        assertThat(DeltaApplyRules.verdict(complete = false, hasGap = false, needsRichRefresh = false))
            .isEqualTo(DeltaApplyRules.Verdict.FALL_BACK_TO_FULL)
        assertThat(DeltaApplyRules.verdict(complete = true, hasGap = true, needsRichRefresh = false))
            .isEqualTo(DeltaApplyRules.Verdict.FALL_BACK_TO_FULL)
        assertThat(DeltaApplyRules.verdict(complete = true, hasGap = false, needsRichRefresh = true))
            .isEqualTo(DeltaApplyRules.Verdict.FALL_BACK_TO_FULL)
        assertThat(DeltaApplyRules.verdict(complete = true, hasGap = false, needsRichRefresh = false))
            .isEqualTo(DeltaApplyRules.Verdict.SETTLED)
    }
}
