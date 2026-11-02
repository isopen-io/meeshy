package me.meeshy.sdk.chrome

import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.chrome.FloatingButtonGeometry
import me.meeshy.sdk.model.chrome.FloatingButtonPlacement
import me.meeshy.sdk.model.chrome.FloatingButtonSide
import me.meeshy.sdk.testing.TestDataStores
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class FloatingButtonPositionStoreTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val dataStores = TestDataStores()

    @After
    fun tearDown() = dataStores.close()

    private fun placement(side: FloatingButtonSide, fraction: Float) =
        FloatingButtonPlacement.of(side, fraction).storageValue

    // Parite iOS : le Flux en haut a gauche, le Menu en haut a droite.
    @Test
    fun `defaults mirror iOS - feed top left, menu top right`() = runTest {
        val store = InMemoryFloatingButtonPositionStore()
        assertThat(store.leftStorage.value).isEqualTo(FloatingButtonGeometry.DEFAULT_FEED_STORAGE)
        assertThat(store.rightStorage.value).isEqualTo(FloatingButtonGeometry.DEFAULT_MENU_STORAGE)
    }

    @Test
    fun `a written position is read back`() = runTest {
        val store = InMemoryFloatingButtonPositionStore()
        val moved = placement(FloatingButtonSide.LEADING, 0.2f)
        store.setLeftStorage(moved)
        assertThat(store.leftStorage.value).isEqualTo(moved)
    }

    // Chaque bouton a sa propre cle : deplacer l'un ne repositionne pas l'autre.
    @Test
    fun `the two buttons hold independent positions`() = runTest {
        val store = InMemoryFloatingButtonPositionStore()
        store.setLeftStorage(placement(FloatingButtonSide.LEADING, 0.1f))
        assertThat(store.rightStorage.value).isEqualTo(FloatingButtonGeometry.DEFAULT_MENU_STORAGE)

        store.setRightStorage(placement(FloatingButtonSide.TRAILING, 0.9f))
        assertThat(store.leftStorage.value).isEqualTo(placement(FloatingButtonSide.LEADING, 0.1f))
    }

    @Test
    fun `an unreadable write is ignored, the button keeps its place`() = runTest {
        val store = InMemoryFloatingButtonPositionStore()
        store.setLeftStorage("garbage")
        assertThat(store.leftStorage.value).isEqualTo(FloatingButtonGeometry.DEFAULT_FEED_STORAGE)
    }

    @Test
    fun `the durable store persists side plus height`() = runTest(dataStores.dispatcher) {
        val file = tmp.newFile("buttons.preferences_pb")
        val store = DataStoreFloatingButtonPositionStore(dataStores.preferences(file), dataStores.scope)
        val moved = placement(FloatingButtonSide.TRAILING, 0.6f)
        store.setRightStorage(moved)
        assertThat(store.rightStorage.first { it == moved }).isEqualTo(moved)
        assertThat(store.leftStorage.value).isEqualTo(FloatingButtonGeometry.DEFAULT_FEED_STORAGE)
    }

    // Migration par lecture : la forme `x,y` ecrite par le build precedent est rendue telle
    // quelle (la geometrie la relit), une valeur corrompue retombe sur le defaut.
    @Test
    fun `the durable store reads the previous x,y form and drops a corrupt value`() = runTest(dataStores.dispatcher) {
        val dataStore = dataStores.preferences(tmp.newFile("legacy.preferences_pb"))
        dataStore.edit { prefs ->
            prefs[stringPreferencesKey("floating_button_left")] = "0.0,0.82"
            prefs[stringPreferencesKey("floating_button_right")] = "not-a-position"
        }
        val store = DataStoreFloatingButtonPositionStore(dataStore, dataStores.scope)
        assertThat(store.leftStorage.first { it == "0.0,0.82" }).isEqualTo("0.0,0.82")
        assertThat(store.rightStorage.value).isEqualTo(FloatingButtonGeometry.DEFAULT_MENU_STORAGE)
    }
}
