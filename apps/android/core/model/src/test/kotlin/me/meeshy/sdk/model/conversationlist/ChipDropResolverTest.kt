package me.meeshy.sdk.model.conversationlist

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ChipDropResolverTest {

    private val categoryA = "6512f2a0e1b4c3d2a1908877"
    private val categoryB = "6512f2a0e1b4c3d2a1908878"

    private fun action(
        on: String?,
        pinned: Boolean = false,
        current: String = "",
        scrolling: Boolean = false,
    ) = ChipDropResolver.action(on, isPinned = pinned, currentSectionId = current, isAutoScrolling = scrolling)

    @Test
    fun `un dépôt hors de tout en-tête ne fait rien`() {
        assertThat(action(null)).isEqualTo(ChipDropAction.None)
    }

    @Test
    fun `déposer sur Épinglées épingle une conversation non épinglée`() {
        assertThat(action("pinned")).isEqualTo(ChipDropAction.Pin)
    }

    @Test
    fun `déposer sur Épinglées ne désépingle jamais`() {
        assertThat(action("pinned", pinned = true)).isEqualTo(ChipDropAction.None)
    }

    @Test
    fun `déposer sur Mes conversations depuis une catégorie efface la catégorie`() {
        assertThat(action("other", current = categoryA)).isEqualTo(ChipDropAction.Move(""))
    }

    @Test
    fun `déposer sur Mes conversations sans catégorie ne fait rien`() {
        assertThat(action("other")).isEqualTo(ChipDropAction.None)
    }

    @Test
    fun `déposer sur une catégorie range dans cette catégorie et pas dans une autre`() {
        assertThat(action(categoryB)).isEqualTo(ChipDropAction.Move(categoryB))
        assertThat(action(categoryB)).isNotEqualTo(ChipDropAction.Move(categoryA))
    }

    @Test
    fun `déposer sur sa propre catégorie ne fait rien`() {
        assertThat(action(categoryA, current = categoryA)).isEqualTo(ChipDropAction.None)
    }

    @Test
    fun `déposer sur Épinglées épingle même depuis la catégorie de la rangée`() {
        assertThat(action("pinned", current = categoryA)).isEqualTo(ChipDropAction.Pin)
    }

    @Test
    fun `un dépôt pendant un défilement automatique est ignoré même sur un en-tête valide`() {
        assertThat(action(categoryA, scrolling = true)).isEqualTo(ChipDropAction.None)
        assertThat(action("pinned", scrolling = true)).isEqualTo(ChipDropAction.None)
    }

    @Test
    fun `au repos en zone de bord le dépôt reste légitime`() {
        assertThat(action(categoryA, scrolling = false)).isEqualTo(ChipDropAction.Move(categoryA))
    }

    @Test
    fun `les sections calculées, En direct et la tête World Wide refusent le dépôt`() {
        listOf(
            LentilleSectionIdentity.LIVE_ID,
            LentilleSectionIdentity.idFor(TemporalSectionKind.TODAY),
            LentilleSectionIdentity.idFor(TemporalSectionKind.OLDER),
            ConversationWorldHead.SECTION_ID,
        ).forEach { assertThat(action(it)).isEqualTo(ChipDropAction.None) }
    }
}
