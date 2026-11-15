package me.meeshy.sdk.model.conversationlist

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationListSectionDefaultsTest {

    private val d = ConversationListSectionDefaults

    @Test
    fun `premiere ouverture deplie epinglees et mes conversations`() {
        assertThat(d.initial(remembered = null)).containsExactly("pinned", "other")
    }

    @Test
    fun `une categorie isExpanded s'ajoute aux defauts`() {
        assertThat(d.initial(null, listOf("work"))).containsExactly("pinned", "other", "work")
    }

    @Test
    fun `la memoire de session prime sur les defauts`() {
        assertThat(d.initial(setOf("work"), listOf("family"))).containsExactly("work")
    }

    @Test
    fun `section unique other n'a aucun en-tete et reste visible`() {
        val single = d.isSingleUngroupedSection(listOf("world.head", "other"))
        assertThat(single).isTrue()
        assertThat(d.showsHeader("other", single)).isFalse()
        assertThat(d.isContentVisible("other", emptySet(), single)).isTrue()
    }

    @Test
    fun `deux sections ou autre que other ne sont pas plates`() {
        assertThat(d.isSingleUngroupedSection(listOf("pinned", "other"))).isFalse()
        assertThat(d.isSingleUngroupedSection(listOf("work"))).isFalse()
        assertThat(d.isSingleUngroupedSection(emptyList())).isFalse()
    }

    @Test
    fun `sections calculees ne sont ni repliables ni cibles de depot et restent visibles`() {
        val id = LentilleSectionIdentity.idFor(TemporalSectionKind.YESTERDAY)
        assertThat(d.isCollapsible(id)).isFalse()
        assertThat(d.acceptsDrop(LentilleSectionIdentity.LIVE_ID)).isFalse()
        assertThat(d.isContentVisible(id, emptySet(), false)).isTrue()
    }

    @Test
    fun `categorie repliable visible seulement si depliee`() {
        assertThat(d.isCollapsible("work")).isTrue()
        assertThat(d.isContentVisible("work", emptySet(), false)).isFalse()
        assertThat(d.isContentVisible("work", setOf("work"), false)).isTrue()
    }
}
