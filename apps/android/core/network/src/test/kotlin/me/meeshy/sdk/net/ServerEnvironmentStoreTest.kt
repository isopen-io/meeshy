package me.meeshy.sdk.net

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.auth.ServerEnvironment
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Behavioural spec for [ServerEnvironmentStore] — the persistence seam behind the
 * login screen's developer/QA environment picker, driving [ServerEnvironmentResolver]
 * into [MeeshyConfig] at app launch (parity: iOS `MeeshyConfig.selectedEnvironment`/
 * `.customHost`/`.applyEnvironment`/`.restoreEnvironment`,
 * `packages/MeeshySDK/Sources/MeeshySDK/Configuration/MeeshyConfig.swift`).
 *
 * [select] mirrors tapping a non-custom pill on iOS `LoginView`
 * (`if env != .custom { MeeshyConfig.shared.applyEnvironment(env) }`) — it never
 * touches the persisted custom host. [applyCustomHost] mirrors the checkmark button
 * (`MeeshyConfig.shared.applyEnvironment(.custom, customHost: host)`) — it persists
 * the host AND flips the selected environment to [ServerEnvironment.CUSTOM] in one
 * step, matching `applyEnvironment`'s own `selectedEnvironment = env` assignment.
 *
 * Robolectric backs the whole class (not just the SharedPrefs cases) — a bare
 * `getSharedPreferences` isn't needed by the InMemory cases, but JUnit runs every
 * `@Before` once per class regardless of which test method follows.
 */
@RunWith(RobolectricTestRunner::class)
class ServerEnvironmentStoreTest {

    // --- InMemoryServerEnvironmentStore ---

    @Test
    fun inMemory_freshStore_defaultsToProduction() {
        val store = InMemoryServerEnvironmentStore()

        assertThat(store.selectedEnvironment).isEqualTo(ServerEnvironment.PRODUCTION)
        assertThat(store.customHost).isEmpty()
    }

    @Test
    fun inMemory_select_updatesTheSelectedEnvironment() {
        val store = InMemoryServerEnvironmentStore()

        store.select(ServerEnvironment.STAGING)

        assertThat(store.selectedEnvironment).isEqualTo(ServerEnvironment.STAGING)
    }

    @Test
    fun inMemory_select_neverTouchesTheCustomHost() {
        val store = InMemoryServerEnvironmentStore()
        store.applyCustomHost("gate.example.com")

        store.select(ServerEnvironment.LOCALHOST)

        assertThat(store.customHost).isEqualTo("gate.example.com")
    }

    @Test
    fun inMemory_applyCustomHost_persistsTheHostAndSelectsCustom() {
        val store = InMemoryServerEnvironmentStore()

        store.applyCustomHost("gate.example.com")

        assertThat(store.selectedEnvironment).isEqualTo(ServerEnvironment.CUSTOM)
        assertThat(store.customHost).isEqualTo("gate.example.com")
    }

    // --- SharedPrefsServerEnvironmentStore ---

    private lateinit var context: Context

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE).edit().clear().commit()
    }

    private fun newStore() = SharedPrefsServerEnvironmentStore(context)

    @Test
    fun sharedPrefs_freshStore_defaultsToProduction() {
        val store = newStore()

        assertThat(store.selectedEnvironment).isEqualTo(ServerEnvironment.PRODUCTION)
        assertThat(store.customHost).isEmpty()
    }

    @Test
    fun sharedPrefs_select_survivesAFreshStoreConstruction() {
        newStore().select(ServerEnvironment.STAGING)

        assertThat(newStore().selectedEnvironment).isEqualTo(ServerEnvironment.STAGING)
    }

    @Test
    fun sharedPrefs_applyCustomHost_survivesAFreshStoreConstruction() {
        newStore().applyCustomHost("gate.example.com")

        val reopened = newStore()
        assertThat(reopened.selectedEnvironment).isEqualTo(ServerEnvironment.CUSTOM)
        assertThat(reopened.customHost).isEqualTo("gate.example.com")
    }

    @Test
    fun sharedPrefs_select_neverTouchesAPreviouslyPersistedCustomHost() {
        val store = newStore()
        store.applyCustomHost("gate.example.com")

        store.select(ServerEnvironment.PRODUCTION)

        assertThat(newStore().customHost).isEqualTo("gate.example.com")
    }

    @Test
    fun sharedPrefs_anUnknownPersistedEnvironmentId_fallsBackToProduction() {
        context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)
            .edit().putString(KEY_ENVIRONMENT, "not-a-real-environment").commit()

        assertThat(newStore().selectedEnvironment).isEqualTo(ServerEnvironment.PRODUCTION)
    }

    private companion object {
        private const val FILE_NAME = "meeshy_server_environment"
        private const val KEY_ENVIRONMENT = "selected_environment"
    }
}
