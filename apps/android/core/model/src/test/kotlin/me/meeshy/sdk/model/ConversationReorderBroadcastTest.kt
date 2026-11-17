package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.conversationlist.ConversationSortOrder
import me.meeshy.sdk.model.conversationlist.SectionableConversation
import org.junit.Test

/**
 * #18915 (AND-04) — `user:preferences-reordered` folded onto the cached rows. The payload is the gateway's own
 * (`reorderConversationPreferences` → `broadcastToUser`, `services/gateway/src/services/conversationPreferencesSync.ts`),
 * copied key by key and passed through the REAL decoder; the order it leaves is read through [ConversationSortOrder],
 * the law the category sections are sorted by.
 */
class ConversationReorderBroadcastTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private val broadcast = """
        {
          "userId": "u1",
          "updates": [
            { "conversationId": "c-a", "orderInCategory": 1 },
            { "conversationId": "c-b", "orderInCategory": 0 }
          ]
        }
    """.trimIndent()

    private fun decoded() = json.decodeFromString<UserPreferencesReorderedSocketData>(broadcast)

    private fun sorted(rows: Map<String, ApiConversationPreferences?>): List<String> =
        ConversationSortOrder.sort(
            rows.map { (id, prefs) ->
                SectionableConversation(
                    id = id,
                    isPinned = false,
                    categoryId = prefs?.categoryId,
                    orderInCategory = prefs?.orderInCategory?.toDouble(),
                    updatedAtMillis = 0L,
                )
            },
        ).map { it.id }

    @Test
    fun `the gateway's reorder broadcast, folded onto the cached rows, inverts their order in the category`() {
        val cached = mapOf(
            "c-a" to ApiConversationPreferences(categoryId = "work", orderInCategory = 0, version = 4),
            "c-b" to ApiConversationPreferences(categoryId = "work", orderInCategory = 1, version = 2),
        )

        val folded = decoded().updatesFor("u1").associate { update ->
            update.conversationId to cached[update.conversationId].reorderedTo(update.orderInCategory)
        }

        assertThat(sorted(cached)).containsExactly("c-a", "c-b").inOrder()
        assertThat(sorted(folded)).containsExactly("c-b", "c-a").inOrder()
    }

    @Test
    fun `the fold moves the order alone and keeps the version the preference broadcasts arbitrate with`() {
        val folded = ApiConversationPreferences(categoryId = "work", orderInCategory = 0, isPinned = true, version = 7)
            .reorderedTo(3)

        assertThat(folded).isEqualTo(
            ApiConversationPreferences(categoryId = "work", orderInCategory = 3, isPinned = true, version = 7),
        )
    }

    @Test
    fun `a row already at the broadcast place is left unwritten`() {
        assertThat(ApiConversationPreferences(orderInCategory = 2).reorderedTo(2)).isNull()
    }

    @Test
    fun `a row with no preferences yet takes the broadcast place`() {
        val none: ApiConversationPreferences? = null

        assertThat(none.reorderedTo(1)).isEqualTo(ApiConversationPreferences(orderInCategory = 1))
    }

    @Test
    fun `a reorder broadcast for another account, or read signed out, folds nothing`() {
        assertThat(decoded().updatesFor("u2")).isEmpty()
        assertThat(decoded().updatesFor(null)).isEmpty()
        assertThat(decoded().updatesFor("u1").map { it.conversationId }).containsExactly("c-a", "c-b").inOrder()
    }
}
