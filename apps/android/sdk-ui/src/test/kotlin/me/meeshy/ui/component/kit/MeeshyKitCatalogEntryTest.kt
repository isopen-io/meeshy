package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * K00 — le modèle du catalogue du kit, miroir de `MeeshyKitCatalogEntryTests` (iOS) : un composant sans état
 * n'est pas livré, la tuile pressée suit la tuile vivante et n'existe que pour un état qui se touche.
 */
class MeeshyKitCatalogEntryTest {

    private fun entry(vararg states: MeeshyKitCatalogState) =
        MeeshyKitCatalogEntry(key = "K02", name = "MeeshyGlassButton", states = states.toList())

    @Test
    fun `une entree sans etat ne se livre pas`() {
        assertThat(entry().isDelivered).isFalse()
        assertThat(entry().tiles).isEmpty()
    }

    @Test
    fun `un etat par defaut est sombre et ne se touche pas`() {
        val state = MeeshyKitCatalogState(id = "repos")

        assertThat(state.backdrop).isEqualTo(MeeshyKitCatalogBackdrop.Dark)
        assertThat(state.isTouchable).isFalse()
        assertThat(state.boardView).isNull()
    }

    @Test
    fun `la tuile pressee n'existe que pour un etat qui se touche`() {
        val tiles = entry(
            MeeshyKitCatalogState(id = "repos", boardView = "R1"),
            MeeshyKitCatalogState(id = "actif", boardView = "R3", isTouchable = true),
        ).tiles

        assertThat(tiles.map { it.id }).containsExactly("repos", "actif", "actif-presse").inOrder()
        assertThat(tiles.map { it.isPressed }).containsExactly(false, false, true).inOrder()
    }

    @Test
    fun `la tuile pressee suit la tuile vivante dans l'ordre de la fiche`() {
        val tiles = entry(
            MeeshyKitCatalogState(id = "a", isTouchable = true),
            MeeshyKitCatalogState(id = "b", isTouchable = true),
        ).tiles

        assertThat(tiles.map { it.id }).containsExactly("a", "a-presse", "b", "b-presse").inOrder()
    }

    @Test
    fun `le nom accessible dit la cle et le nom`() {
        assertThat(entry().accessibilityName).isEqualTo("K02 MeeshyGlassButton")
    }

    @Test
    fun `les trois fonds sont ceux de la planche`() {
        assertThat(MeeshyKitCatalogBackdrop.entries.map { it.name })
            .containsExactly("Dark", "Light", "Media").inOrder()
    }
}
