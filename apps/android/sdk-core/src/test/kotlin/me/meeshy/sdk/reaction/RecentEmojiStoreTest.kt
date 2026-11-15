package me.meeshy.sdk.reaction

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class RecentEmojiStoreTest {

    private lateinit var context: Context

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        context.getSharedPreferences("meeshy_recent_emojis", Context.MODE_PRIVATE).edit().clear().commit()
    }

    private fun newStore() = SharedPrefsRecentEmojiStore(context)

    @Test
    fun a_fresh_store_has_no_history() {
        assertThat(newStore().history.value).isEmpty()
        assertThat(InMemoryRecentEmojiStore().history.value).isEmpty()
    }

    @Test
    fun the_latest_pick_leads_and_a_repeat_moves_to_the_front() {
        val store = InMemoryRecentEmojiStore()
        store.record("🔥")
        store.record("🎉")
        store.record("🔥")
        assertThat(store.history.value).containsExactly("🔥", "🎉").inOrder()
    }

    @Test
    fun the_history_survives_a_restart() {
        val first = newStore()
        first.record("🔥")
        first.record("🎉")

        val afterRestart = newStore()

        assertThat(afterRestart.history.value).containsExactly("🎉", "🔥").inOrder()
    }

    @Test
    fun only_the_twenty_latest_are_kept_on_disk_too() {
        val store = newStore()
        (1..25).forEach { store.record("e$it") }

        val afterRestart = newStore()

        assertThat(afterRestart.history.value).hasSize(20)
        assertThat(afterRestart.history.value.first()).isEqualTo("e25")
    }

    @Test
    fun a_corrupt_payload_reads_as_an_empty_history() {
        context.getSharedPreferences("meeshy_recent_emojis", Context.MODE_PRIVATE)
            .edit().putString("history", "{not json").commit()

        assertThat(newStore().history.value).isEmpty()
    }

    @Test
    fun the_shared_store_is_one_instance_for_every_caller() {
        assertThat(SharedPrefsRecentEmojiStore.shared(context))
            .isSameInstanceAs(SharedPrefsRecentEmojiStore.shared(context))
    }
}
