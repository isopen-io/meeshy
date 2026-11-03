package me.meeshy.app.notifications

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.NotificationFilterCategory
import org.junit.Test

class NotificationCategoryPresentationTest {

    @Test
    fun `the twelve categories each have a label, an icon, an empty title and a color`() {
        assertThat(NotificationFilterCategory.entries).hasSize(12)
        NotificationFilterCategory.entries.forEach { category ->
            assertThat(category.labelRes()).isNotEqualTo(0)
            assertThat(category.emptyRes()).isNotEqualTo(0)
            assertThat(category.icon()).isNotNull()
            assertThat(category.color().alpha).isEqualTo(1f)
        }
    }

    @Test
    fun `each category owns a distinct empty title`() {
        val titles = NotificationFilterCategory.entries.map { it.emptyRes() }
        assertThat(titles.toSet()).hasSize(NotificationFilterCategory.entries.size)
    }
}
