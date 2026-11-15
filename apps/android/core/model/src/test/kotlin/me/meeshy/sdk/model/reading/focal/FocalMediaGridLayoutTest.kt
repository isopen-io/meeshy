package me.meeshy.sdk.model.reading.focal

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FocalMediaGridLayoutTest {

    @Test
    fun `aucun média ne donne aucun slot`() {
        assertThat(FocalMediaGridLayout.slots(0)).isEmpty()
    }

    @Test
    fun `un média est 300 sur 240`() {
        assertThat(FocalMediaGridLayout.slots(1)).containsExactly(FocalMediaSlot(300f, 240f))
    }

    @Test
    fun `deux médias sont deux fois 149 sur 180`() {
        assertThat(FocalMediaGridLayout.slots(2)).containsExactly(
            FocalMediaSlot(149f, 180f),
            FocalMediaSlot(149f, 180f),
        )
    }

    @Test
    fun `trois médias se partagent 60 40 sur 240`() {
        val slots = FocalMediaGridLayout.slots(3)
        assertThat(slots.map { it.height }).containsExactly(240f, 240f, 240f)
        assertThat(slots[0].width).isWithin(0.001f).of(178.8f)
        assertThat(slots[1].width).isWithin(0.001f).of(119.2f)
        assertThat(slots[2].width).isEqualTo(slots[1].width)
    }

    @Test
    fun `quatre médias font un quadrillage sans compteur`() {
        val slots = FocalMediaGridLayout.slots(4)
        assertThat(slots).hasSize(4)
        assertThat(slots.all { it.width == 149f && it.height == 240f }).isTrue()
        assertThat(slots.map { it.overflowCount }).containsExactly(0, 0, 0, 0)
    }

    @Test
    fun `au-delà de quatre la dernière cellule porte le plus N`() {
        val slots = FocalMediaGridLayout.slots(9)
        assertThat(slots).hasSize(4)
        assertThat(slots.last().overflowCount).isEqualTo(5)
        assertThat(slots.dropLast(1).all { it.overflowCount == 0 }).isTrue()
    }

    @Test
    fun `la largeur maximale s'applique et l'espacement est 2`() {
        assertThat(FocalMediaGridLayout.GRID_SPACING).isEqualTo(2f)
        assertThat(FocalMediaGridLayout.slots(1, maxWidth = 250f).single().width).isEqualTo(250f)
    }

    @Test
    fun `une vidéo seule suit son format`() {
        assertThat(FocalMediaGridLayout.soloVideoSlot(16f / 9f)).isEqualTo(FocalMediaSlot(300f, 169f))
    }

    @Test
    fun `une vidéo portrait est plafonnée à 1,6 fois la largeur`() {
        val slot = FocalMediaGridLayout.soloVideoSlot(9f / 16f)
        assertThat(slot.height).isEqualTo(480f)
        assertThat(slot.width).isEqualTo(270f)
    }

    @Test
    fun `un format inconnu retombe sur 16 9`() {
        assertThat(FocalMediaGridLayout.soloVideoSlot(null)).isEqualTo(FocalMediaGridLayout.soloVideoSlot(16f / 9f))
        assertThat(FocalMediaGridLayout.soloVideoSlot(0f)).isEqualTo(FocalMediaGridLayout.soloVideoSlot(16f / 9f))
    }

    @Test
    fun `la grille se réduit à la colonne sur un écran étroit`() {
        assertThat(FocalMediaGridLayout.gridWidth(null)).isEqualTo(300f)
        assertThat(FocalMediaGridLayout.gridWidth(390f)).isEqualTo(261f)
        assertThat(FocalMediaGridLayout.gridWidth(900f)).isEqualTo(300f)
        assertThat(FocalMediaGridLayout.gridWidth(50f)).isEqualTo(0f)
    }
}
