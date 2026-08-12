package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * Behavioural spec for the category socket wire payloads and their pure mapping to
 * [CategoryEvent] — the framework-free port of iOS `ConversationStoreSocketBridge`
 * routing `category:created/updated/deleted` + `categories:reordered` into
 * `UserCategoryStore.applyRemote` (`ConversationStoreSocketBridge.swift`).
 */
class CategorySocketPayloadsTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    @Test
    fun `an upserted payload maps to an Upserted event with the narrowed option`() {
        val payload = CategoryUpsertedSocketData(
            userId = "u1",
            category = ApiCategory(id = "work", name = "Work", color = "#FF0000", icon = "briefcase", order = 2),
        )

        val event = payload.toEvent()

        assertThat(event).isEqualTo(CategoryEvent.Upserted(CategoryOption(id = "work", name = "Work", order = 2)))
    }

    @Test
    fun `an upserted payload preserves a null order rather than coercing it`() {
        val payload = CategoryUpsertedSocketData(
            userId = "u1",
            category = ApiCategory(id = "fresh", name = "Fresh"),
        )

        val event = payload.toEvent() as CategoryEvent.Upserted

        assertThat(event.category.order).isNull()
    }

    @Test
    fun `a deleted payload maps to a Deleted event by id`() {
        val payload = CategoryDeletedSocketData(userId = "u1", categoryId = "gone")

        assertThat(payload.toEvent()).isEqualTo(CategoryEvent.Deleted("gone"))
    }

    @Test
    fun `a reordered payload maps to a Reordered event as an id-to-order map`() {
        val payload = CategoriesReorderedSocketData(
            userId = "u1",
            updates = listOf(
                CategoryOrderUpdate(categoryId = "a", order = 0),
                CategoryOrderUpdate(categoryId = "b", order = 1),
            ),
        )

        assertThat(payload.toEvent()).isEqualTo(CategoryEvent.Reordered(mapOf("a" to 0, "b" to 1)))
    }

    @Test
    fun `a reordered payload with a repeated id keeps the last order`() {
        val payload = CategoriesReorderedSocketData(
            userId = "u1",
            updates = listOf(
                CategoryOrderUpdate(categoryId = "a", order = 0),
                CategoryOrderUpdate(categoryId = "a", order = 9),
            ),
        )

        assertThat(payload.toEvent()).isEqualTo(CategoryEvent.Reordered(mapOf("a" to 9)))
    }

    @Test
    fun `an empty reordered payload maps to an empty Reordered event`() {
        val payload = CategoriesReorderedSocketData(userId = "u1", updates = emptyList())

        assertThat(payload.toEvent()).isEqualTo(CategoryEvent.Reordered(emptyMap()))
    }

    @Test
    fun `the upserted wire shape decodes while ignoring the gateway-only category keys`() {
        val wire = """
            {"userId":"u1","category":{"id":"work","userId":"u1","name":"Work",
            "color":"#FF0000","icon":"briefcase","order":3,"isExpanded":true,
            "createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-02T00:00:00Z"}}
        """.trimIndent()

        val payload = json.decodeFromString<CategoryUpsertedSocketData>(wire)

        assertThat(payload.toEvent())
            .isEqualTo(CategoryEvent.Upserted(CategoryOption(id = "work", name = "Work", order = 3)))
    }

    @Test
    fun `the reordered wire shape decodes the update array`() {
        val wire = """{"userId":"u1","updates":[{"categoryId":"a","order":0},{"categoryId":"b","order":2}]}"""

        val payload = json.decodeFromString<CategoriesReorderedSocketData>(wire)

        assertThat(payload.toEvent()).isEqualTo(CategoryEvent.Reordered(mapOf("a" to 0, "b" to 2)))
    }
}
