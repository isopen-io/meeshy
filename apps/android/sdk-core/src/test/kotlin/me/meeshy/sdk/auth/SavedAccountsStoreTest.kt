package me.meeshy.sdk.auth

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.auth.SavedAccount
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Durability tests for [SharedPrefsSavedAccountsStore] — the persistence seam behind
 * the pure `SavedAccounts` transforms (`:core:model`), mirroring
 * [me.meeshy.sdk.chat.SharedPrefsStarredMessagesStore]'s test shape. The store always
 * exposes an already-[me.meeshy.sdk.model.auth.SavedAccounts.sorted] list — callers
 * never re-sort.
 */
@RunWith(RobolectricTestRunner::class)
class SharedPrefsSavedAccountsStoreTest {

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private lateinit var context: Context

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE).edit().clear().commit()
    }

    private fun newStore() = SharedPrefsSavedAccountsStore(context, json)

    private fun account(id: String, username: String = "user-$id", lastActiveAtMillis: Long = 1L) =
        SavedAccount(
            id = id,
            username = username,
            displayName = null,
            avatarUrl = null,
            lastActiveAtMillis = lastActiveAtMillis,
        )

    @Test
    fun a_fresh_store_starts_empty() {
        assertThat(newStore().accounts.value).isEmpty()
    }

    @Test
    fun upsert_adds_a_new_account_to_the_front() {
        val store = newStore()

        store.upsert(account("a1", lastActiveAtMillis = 10L))
        store.upsert(account("a2", lastActiveAtMillis = 20L))

        assertThat(store.accounts.value.map { it.id }).containsExactly("a2", "a1").inOrder()
    }

    @Test
    fun upsert_replaces_an_existing_account_by_id_and_re_sorts() {
        val store = newStore()
        store.upsert(account("a1", lastActiveAtMillis = 10L))
        store.upsert(account("a2", lastActiveAtMillis = 20L))

        store.upsert(account("a1", username = "renamed", lastActiveAtMillis = 30L))

        assertThat(store.accounts.value.map { it.id }).containsExactly("a1", "a2").inOrder()
        assertThat(store.accounts.value.first().username).isEqualTo("renamed")
    }

    @Test
    fun accounts_survive_a_fresh_store_construction() {
        newStore().upsert(account("a1", username = "durable", lastActiveAtMillis = 5L))

        val reopened = newStore()

        assertThat(reopened.accounts.value.single().username).isEqualTo("durable")
    }

    @Test
    fun remove_drops_a_persisted_account() {
        val store = newStore()
        store.upsert(account("a1"))
        store.upsert(account("a2"))

        store.remove("a1")

        assertThat(newStore().accounts.value.map { it.id }).containsExactly("a2")
    }

    @Test
    fun remove_of_an_unknown_id_is_inert() {
        val store = newStore()
        store.upsert(account("a1"))
        val before = store.accounts.value

        store.remove("unknown")

        assertThat(store.accounts.value).isSameInstanceAs(before)
    }

    @Test
    fun a_corrupt_persisted_blob_degrades_to_an_empty_list() {
        context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)
            .edit().putString(KEY_ITEMS, "}{ not json").commit()

        assertThat(newStore().accounts.value).isEmpty()
    }

    private companion object {
        private const val FILE_NAME = "meeshy_saved_accounts"
        private const val KEY_ITEMS = "items"
    }
}
