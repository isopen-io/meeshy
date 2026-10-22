package me.meeshy.sdk.permission

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.testing.TestDataStores
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * La mémoire des demandes d'accès : c'est elle qui distingue, sur Android, « jamais demandé »
 * d'un refus définitif. Elle doit survivre au redémarrage du processus et ne jamais mélanger
 * deux permissions.
 *
 * Les cas tournent sur [TestDataStores] (planificateur inline et déterministe), sans aucune
 * borne en temps réel.
 */
class PermissionRequestHistoryTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val dataStores = TestDataStores()

    @After
    fun tearDown() = dataStores.close()

    private val microphone = "android.permission.RECORD_AUDIO"
    private val camera = "android.permission.CAMERA"

    private fun history(name: String = "history.preferences_pb") =
        DataStorePermissionRequestHistory(dataStores.preferences(tmp.newFile(name)))

    @Test
    fun `a permission never asked is not reported as requested`() = runTest(dataStores.dispatcher) {
        assertThat(history().wasRequested(microphone)).isFalse()
    }

    @Test
    fun `a marked permission is read back as requested`() = runTest(dataStores.dispatcher) {
        val history = history()

        history.markRequested(listOf(microphone))

        assertThat(history.wasRequested(microphone)).isTrue()
    }

    @Test
    fun `marking one permission leaves the others untouched`() = runTest(dataStores.dispatcher) {
        val history = history()

        history.markRequested(listOf(microphone))

        assertThat(history.wasRequested(camera)).isFalse()
    }

    @Test
    fun `several permissions are marked together and read back among a wider set`() = runTest(dataStores.dispatcher) {
        val history = history()
        history.markRequested(listOf(microphone, camera))

        val among = history.requestedAmong(listOf(camera, "android.permission.READ_CONTACTS"))

        assertThat(among).containsExactly(camera)
    }

    @Test
    fun `marking twice is idempotent`() = runTest(dataStores.dispatcher) {
        val history = history()

        history.markRequested(listOf(microphone))
        history.markRequested(listOf(microphone))

        assertThat(history.requestedAmong(listOf(microphone))).containsExactly(microphone)
    }

    @Test
    fun `marking nothing writes nothing`() = runTest(dataStores.dispatcher) {
        val history = history()

        history.markRequested(emptyList())

        assertThat(history.requestedAmong(listOf(microphone, camera))).isEmpty()
    }

    @Test
    fun `a fresh history over the same durable store reads what an earlier one wrote`() = runTest(dataStores.dispatcher) {
        val dataStore = dataStores.preferences(tmp.newFile("restart.preferences_pb"))
        DataStorePermissionRequestHistory(dataStore).markRequested(listOf(microphone))

        val afterRestart = DataStorePermissionRequestHistory(dataStore)

        assertThat(afterRestart.wasRequested(microphone)).isTrue()
        assertThat(afterRestart.wasRequested(camera)).isFalse()
    }
}
