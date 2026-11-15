package me.meeshy.sdk.model.conversationlist

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SectionDropTargetTest {

    @Test
    fun `Épinglées, Mes conversations et les catégories utilisateur acceptent le dépôt`() {
        listOf("pinned", "other", "work", "family", "6512f2a0e1b4c3d2a1908877").forEach {
            assertThat(ConversationListSectionDefaults.acceptsDrop(it)).isTrue()
        }
    }

    @Test
    fun `les cinq sections propres à la Lentille refusent le dépôt par identifiant littéral`() {
        listOf("lentille.live", "lentille.today", "lentille.yesterday", "lentille.thisWeek", "lentille.older").forEach {
            assertThat(ConversationListSectionDefaults.acceptsDrop(it)).isFalse()
        }
    }

    @Test
    fun `les identifiants littéraux sont exactement ceux que la Lentille émet`() {
        val emitted = setOf(LentilleSectionIdentity.LIVE_ID) +
            TemporalSectionKind.values().map { LentilleSectionIdentity.idFor(it) }
        assertThat(emitted).containsExactly(
            "lentille.live", "lentille.today", "lentille.yesterday", "lentille.thisWeek", "lentille.older",
        )
    }

    @Test
    fun `la tête World Wide refuse le dépôt`() {
        assertThat(ConversationListSectionDefaults.acceptsDrop(ConversationWorldHead.SECTION_ID)).isFalse()
    }
}
