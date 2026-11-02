package me.meeshy.sdk.media

import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.composer.capture.CaptureRenderedSaveMode
import me.meeshy.sdk.model.composer.capture.CaptureSavePolicy
import me.meeshy.sdk.testing.TestDataStores
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class CaptureSavePolicyStoreTest {
    @get:Rule
    val tmp = TemporaryFolder()
    private val dataStores = TestDataStores()

    @After
    fun tearDown() = dataStores.close()

    @Test
    fun `an empty store saves no original and renders on demand`() = runTest(dataStores.dispatcher) {
        val store = DataStoreCaptureSavePolicyStore(dataStores.preferences(tmp.newFile("a.preferences_pb")), dataStores.scope)
        assertThat(store.policy.first()).isEqualTo(CaptureSavePolicy.Standard)
    }

    @Test
    fun `a chosen policy survives a new store on the same file`() = runTest(dataStores.dispatcher) {
        val dataStore = dataStores.preferences(tmp.newFile("b.preferences_pb"))
        val chosen = CaptureSavePolicy(true, CaptureRenderedSaveMode.AUTOMATIC)
        val writer = DataStoreCaptureSavePolicyStore(dataStore, dataStores.scope)
        writer.setPolicy(chosen)
        writer.policy.first { it == chosen }

        assertThat(DataStoreCaptureSavePolicyStore(dataStore, dataStores.scope).policy.first { it == chosen }).isEqualTo(chosen)
    }

    @Test
    fun `a corrupt rendered mode keeps the saved original flag and defaults the mode`() = runTest(dataStores.dispatcher) {
        val dataStore = dataStores.preferences(tmp.newFile("c.preferences_pb"))
        dataStore.edit { it[stringPreferencesKey("meeshy.capture.renderedSaveMode")] = "???" }
        val store = DataStoreCaptureSavePolicyStore(dataStore, dataStores.scope)
        assertThat(store.policy.first().renderedMode).isEqualTo(CaptureRenderedSaveMode.MANUAL)
    }

    @Test
    fun `in-memory store publishes the new policy`() = runTest {
        val store = InMemoryCaptureSavePolicyStore()
        store.setPolicy(CaptureSavePolicy(savesOriginal = true))
        assertThat(store.policy.value.savesOriginal).isTrue()
    }
}
