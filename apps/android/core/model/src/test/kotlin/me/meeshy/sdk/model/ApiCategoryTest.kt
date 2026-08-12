package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of the [ApiCategory] → [CategoryOption] narrowing — the trust
 * boundary between the gateway wire shape and the framework-free catalogue currency.
 * Expectations are hand-written literals, never derived from the code under test.
 */
class ApiCategoryTest {

    private fun wire(
        id: String = "c1",
        name: String = "Work",
        color: String? = "#3B82F6",
        icon: String? = "briefcase",
        order: Int? = 2,
        isExpanded: Boolean? = true,
    ) = ApiCategory(id = id, name = name, color = color, icon = icon, order = order, isExpanded = isExpanded)

    @Test
    fun `toOption keeps id, name and order`() {
        assertThat(wire(id = "abc", name = "Family", order = 5).toOption())
            .isEqualTo(CategoryOption(id = "abc", name = "Family", order = 5))
    }

    @Test
    fun `toOption drops the render-only color, icon and expansion fields`() {
        val option = wire(color = "#FF0000", icon = "star", isExpanded = false).toOption()

        assertThat(option).isEqualTo(CategoryOption(id = "c1", name = "Work", order = 2))
    }

    @Test
    fun `toOption preserves a null order rather than coercing it`() {
        assertThat(wire(order = null).toOption().order).isNull()
    }

    @Test
    fun `toOptions maps a list preserving its incoming order`() {
        val options = listOf(
            wire(id = "a", name = "A", order = 0),
            wire(id = "b", name = "B", order = null),
            wire(id = "c", name = "C", order = 1),
        ).toOptions()

        assertThat(options).containsExactly(
            CategoryOption(id = "a", name = "A", order = 0),
            CategoryOption(id = "b", name = "B", order = null),
            CategoryOption(id = "c", name = "C", order = 1),
        ).inOrder()
    }

    @Test
    fun `toOptions on an empty list yields an empty list`() {
        assertThat(emptyList<ApiCategory>().toOptions()).isEmpty()
    }
}
