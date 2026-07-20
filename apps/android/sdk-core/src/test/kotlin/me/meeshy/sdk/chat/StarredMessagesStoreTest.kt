package me.meeshy.sdk.chat

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.StarredMessage
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class SharedPrefsStarredMessagesStoreTest {

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private lateinit var context: Context

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE).edit().clear().commit()
    }

    private fun newStore() = SharedPrefsStarredMessagesStore(context, json)

    private fun snapshot(id: String, conversationId: String = "c1", at: Long = 1L) =
        StarredMessage(messageId = id, conversationId = conversationId, starredAtMillis = at)

    @Test
    fun a_fresh_store_starts_empty() {
        assertThat(newStore().starred.value.items).isEmpty()
    }

    @Test
    fun toggling_stars_a_message_and_exposes_it_on_the_flow() {
        val store = newStore()

        store.toggle(snapshot("m1"))

        assertThat(store.starred.value.isStarred("m1")).isTrue()
    }

    @Test
    fun toggling_the_same_message_twice_unstars_it() {
        val store = newStore()

        store.toggle(snapshot("m1"))
        store.toggle(snapshot("m1"))

        assertThat(store.starred.value.isStarred("m1")).isFalse()
    }

    @Test
    fun stars_survive_a_fresh_store_construction() {
        newStore().toggle(snapshot("m1", conversationId = "c9", at = 42L))

        val reopened = newStore()

        assertThat(reopened.starred.value.isStarred("m1")).isTrue()
        assertThat(reopened.starred.value.items.single().conversationId).isEqualTo("c9")
        assertThat(reopened.starred.value.items.single().starredAtMillis).isEqualTo(42L)
    }

    @Test
    fun unstar_removes_a_persisted_message() {
        val store = newStore()
        store.toggle(snapshot("m1"))
        store.toggle(snapshot("m2"))

        store.unstar("m1")

        assertThat(newStore().starred.value.ids).containsExactly("m2")
    }

    @Test
    fun remove_conversation_drops_only_that_conversations_stars() {
        val store = newStore()
        store.toggle(snapshot("m1", conversationId = "c1"))
        store.toggle(snapshot("m2", conversationId = "c2"))

        store.removeConversation("c1")

        assertThat(newStore().starred.value.ids).containsExactly("m2")
    }

    @Test
    fun a_corrupt_persisted_blob_degrades_to_an_empty_set() {
        context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)
            .edit().putString(KEY_ITEMS, "}{ not json").commit()

        assertThat(newStore().starred.value.items).isEmpty()
    }

    @Test
    fun an_idempotent_star_does_not_replace_the_flow_value() {
        val store = newStore()
        store.toggle(snapshot("m1", at = 10L))
        val before = store.starred.value

        store.unstar("unknown")

        assertThat(store.starred.value).isSameInstanceAs(before)
    }

    private companion object {
        private const val FILE_NAME = "meeshy_starred_messages"
        private const val KEY_ITEMS = "items"
    }
}
