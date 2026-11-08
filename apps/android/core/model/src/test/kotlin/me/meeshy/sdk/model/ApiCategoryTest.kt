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
    fun `toOption keeps id, name, order and the render attributes`() {
        assertThat(wire(id = "abc", name = "Family", order = 5).toOption())
            .isEqualTo(
                CategoryOption(
                    id = "abc", name = "Family", order = 5,
                    color = "#3B82F6", icon = "briefcase", isExpanded = true,
                ),
            )
    }

    @Test
    fun `toOption exposes the category's own colour, icon and fold state to the UI`() {
        val option = wire(color = "#FF0000", icon = "star", isExpanded = false).toOption()

        assertThat(option.color).isEqualTo("#FF0000")
        assertThat(option.icon).isEqualTo("star")
        assertThat(option.isExpanded).isFalse()
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
            CategoryOption(id = "a", name = "A", order = 0, color = "#3B82F6", icon = "briefcase", isExpanded = true),
            CategoryOption(id = "b", name = "B", order = null, color = "#3B82F6", icon = "briefcase", isExpanded = true),
            CategoryOption(id = "c", name = "C", order = 1, color = "#3B82F6", icon = "briefcase", isExpanded = true),
        ).inOrder()
    }

    @Test
    fun `toOptions on an empty list yields an empty list`() {
        assertThat(emptyList<ApiCategory>().toOptions()).isEmpty()
    }
}

class ApiCategoryExpansionTest {

    @Test
    fun `expansionById keeps only the rows that state a fold state`() {
        val rows = listOf(
            ApiCategory(id = "a", name = "A", isExpanded = false),
            ApiCategory(id = "b", name = "B", isExpanded = true),
            ApiCategory(id = "c", name = "C", isExpanded = null),
        )

        assertThat(rows.expansionById()).containsExactly("a", false, "b", true)
    }

    @Test
    fun `the patch body carries only isExpanded`() {
        val json = kotlinx.serialization.json.Json.encodeToString(CategoryPatchBody.serializer(), CategoryPatchBody(false))

        assertThat(json).isEqualTo("""{"isExpanded":false}""")
    }

    @Test
    fun `an old snapshot written without the render attributes still decodes`() {
        val old = kotlinx.serialization.json.Json.decodeFromString(
            CategoryOption.serializer(),
            """{"id":"c1","name":"Work","order":2}""",
        )

        assertThat(old).isEqualTo(CategoryOption(id = "c1", name = "Work", order = 2))
        assertThat(old.isExpanded).isNull()
    }
}
