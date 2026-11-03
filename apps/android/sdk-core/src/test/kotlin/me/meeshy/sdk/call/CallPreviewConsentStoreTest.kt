package me.meeshy.sdk.call

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.call.CallPreviewConsent
import me.meeshy.sdk.testing.TestDataStores
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class CallPreviewConsentStoreTest {
    @get:Rule
    val tmp = TemporaryFolder()
    private val dataStores = TestDataStores()

    @After
    fun tearDown() = dataStores.close()

    private val both = CallPreviewConsent(sendsAudio = true, sendsVideo = true)
    private val none = CallPreviewConsent(sendsAudio = false, sendsVideo = false)

    private fun store(file: String) =
        DataStoreCallPreviewConsentStore(dataStores.preferences(tmp.newFile(file)), dataStores.scope)

    @Test
    fun `un correspondant jamais appele rend micro coupe et camera activee`() = runTest(dataStores.dispatcher) {
        assertThat(store("a.preferences_pb").consent("moi", "lui")).isEqualTo(CallPreviewConsent.INITIAL)
    }

    @Test
    fun `le choix se relit par couple compte et correspondant`() = runTest(dataStores.dispatcher) {
        val store = store("b.preferences_pb")

        store.remember(both, "moi", "lui")
        store.remember(none, "moi", "elle")

        assertThat(store.consent("moi", "lui")).isEqualTo(both)
        assertThat(store.consent("moi", "elle")).isEqualTo(none)
        assertThat(store.consent("moi", "autre")).isEqualTo(CallPreviewConsent.INITIAL)
    }

    @Test
    fun `un autre compte du meme telephone ne rejoue jamais les choix du premier`() = runTest(dataStores.dispatcher) {
        val store = store("c.preferences_pb")

        store.remember(both, "compte-a", "lui")

        assertThat(store.consent("compte-b", "lui")).isEqualTo(CallPreviewConsent.INITIAL)
        assertThat(store.consent("compte-a", "lui")).isEqualTo(both)
    }

    @Test
    fun `le choix survit a une nouvelle instance sur le meme fichier`() = runTest(dataStores.dispatcher) {
        val dataStore = dataStores.preferences(tmp.newFile("d.preferences_pb"))
        DataStoreCallPreviewConsentStore(dataStore, dataStores.scope).remember(both, "moi", "lui")

        assertThat(DataStoreCallPreviewConsentStore(dataStore, dataStores.scope).consent("moi", "lui")).isEqualTo(both)
    }

    @Test
    fun `la version volatile suit la meme loi`() {
        val store = InMemoryCallPreviewConsentStore()

        store.remember(both, "a", "lui")

        assertThat(store.consent("a", "lui")).isEqualTo(both)
        assertThat(store.consent("b", "lui")).isEqualTo(CallPreviewConsent.INITIAL)
    }
}
