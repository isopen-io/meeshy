package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MyStoryDeleteConfirmationTest {

    @Test
    fun `chaque cible a sa propre confirmation`() {
        val targets = MyStoryDeleteConfirmation.Target.values()
        assertThat(targets.map { it.titleKey }.toSet()).hasSize(targets.size)
        assertThat(targets.map { it.messageKey }.toSet()).hasSize(targets.size)
    }

    @Test
    fun `seul l'echec de publication propose Reprendre`() {
        assertThat(MyStoryDeleteConfirmation.Target.values().filter { it.offersResume })
            .containsExactly(MyStoryDeleteConfirmation.Target.FAILED_ITEM)
    }

    @Test
    fun `les cles sont celles du catalogue iOS`() {
        assertThat(MyStoryDeleteConfirmation.titleKey(MyStoryDeleteConfirmation.Target.DRAFT))
            .isEqualTo("story.mine.drafts.delete.title")
        assertThat(MyStoryDeleteConfirmation.messageKey(MyStoryDeleteConfirmation.Target.FAILED_ITEM))
            .isEqualTo("story.mine.failed.delete.message")
        assertThat(MyStoryDeleteConfirmation.titleKey(MyStoryDeleteConfirmation.Target.BULK_SELECTION))
            .isEqualTo("story.mine.delete.selected.title")
    }
}
