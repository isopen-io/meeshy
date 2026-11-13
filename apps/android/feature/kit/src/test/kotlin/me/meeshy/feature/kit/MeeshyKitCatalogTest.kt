package me.meeshy.feature.kit

import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.kit.MeeshyKitCatalogEntry
import me.meeshy.ui.component.kit.MeeshyKitCatalogState
import org.junit.Test

class MeeshyKitCatalogTest {

    @Test
    fun `le catalogue porte vingt-cinq entrees, cles dans l'ordre`() {
        assertThat(MeeshyKitCatalog.entries).hasSize(25)
        assertThat(MeeshyKitCatalog.entries.map { it.key }).containsExactlyElementsIn((1..25).map { "K%02d".format(it) }).inOrder()
    }

    @Test
    fun `la liste n'affiche que les entrees non vides`() {
        assertThat(MeeshyKitCatalog.listedEntries.all { it.isDelivered }).isTrue()
        assertThat(MeeshyKitCatalog.listedEntries).isEqualTo(MeeshyKitCatalog.entries.filter { it.states.isNotEmpty() })
    }

    @Test
    fun `une cle inconnue ou non livree n'ouvre rien`() {
        assertThat(MeeshyKitCatalog.listedEntry("K99")).isNull()
        assertThat(MeeshyKitCatalog.listedEntry("")).isNull()
    }

    @Test
    fun `une cle livree ouvre son entree, casse ignoree`() {
        val entries = listOf(
            MeeshyKitCatalogEntry("K01", "MeeshyGlassTone"),
            MeeshyKitCatalogEntry("K02", "MeeshyGlassButton", listOf(MeeshyKitCatalogState("repos"))),
        )

        assertThat(MeeshyKitCatalog.listedEntry("k02", entries)?.key).isEqualTo("K02")
        assertThat(MeeshyKitCatalog.listedEntry("K01", entries)).isNull()
        assertThat(MeeshyKitCatalog.listed(entries).map { it.key }).containsExactly("K02")
    }
}
