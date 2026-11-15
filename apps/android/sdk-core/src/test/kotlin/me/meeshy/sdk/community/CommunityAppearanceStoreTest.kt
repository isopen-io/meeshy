package me.meeshy.sdk.community

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.testing.TestDataStores
import me.meeshy.sdk.theme.DynamicColorGenerator
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class CommunityAppearanceStoreTest {
    @get:Rule
    val tmp = TemporaryFolder()
    private val dataStores = TestDataStores()

    @After
    fun tearDown() = dataStores.close()

    private fun store(file: String) = DataStoreCommunityAppearanceStore(dataStores.preferences(tmp.newFile(file)))

    @Test
    fun `sans choix la couleur derive du nom et l'emoji est vide`() = runTest(dataStores.dispatcher) {
        val appearance = store("a.preferences_pb").observe("c1", "Café").first()

        assertThat(appearance.color).isEqualTo(DynamicColorGenerator.colorForName("Café"))
        assertThat(appearance.emoji).isEmpty()
    }

    @Test
    fun `la couleur et l'emoji choisis se relisent par identifiant`() = runTest(dataStores.dispatcher) {
        val store = store("b.preferences_pb")

        store.setColor("c1", "FF00AA")
        store.setEmoji("c1", "🚀")

        assertThat(store.observe("c1", "Café").first()).isEqualTo(CommunityAppearance("FF00AA", "🚀"))
    }

    @Test
    fun `ecrire une communaute n'affecte pas une autre`() = runTest(dataStores.dispatcher) {
        val store = store("c.preferences_pb")

        store.setColor("c1", "FF00AA")
        store.setEmoji("c1", "🚀")

        val other = store.observe("c2", "Autre").first()
        assertThat(other.color).isEqualTo(DynamicColorGenerator.colorForName("Autre"))
        assertThat(other.emoji).isEmpty()
    }

    @Test
    fun `un choix blanc retombe sur le defaut`() = runTest(dataStores.dispatcher) {
        val store = store("d.preferences_pb")
        store.setColor("c1", "  ")

        assertThat(store.observe("c1", "Café").first().color).isEqualTo(DynamicColorGenerator.colorForName("Café"))
    }

    @Test
    fun `clearAll oublie tous les choix`() = runTest(dataStores.dispatcher) {
        val store = store("e.preferences_pb")
        store.setEmoji("c1", "🚀")

        store.clearAll()

        assertThat(store.observe("c1", "Café").first().emoji).isEmpty()
    }

    @Test
    fun `la variante volatile suit les memes regles`() = runTest {
        val store = InMemoryCommunityAppearanceStore()
        store.setEmoji("c1", "🎯")

        assertThat(store.observe("c1", "Café").first().emoji).isEqualTo("🎯")
        assertThat(store.observe("c2", "Café").first().emoji).isEmpty()
    }
}
