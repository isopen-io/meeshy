package me.meeshy.sdk.model.imageedit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ImageEditHistoryTest {
    private val sepia = ImageEditState(filter = ImageFilter.SEPIA)
    private val noir = ImageEditState(filter = ImageFilter.NOIR)
    private val grain = ImageEditState(effect = ImageEffect.GRAIN)

    @Test
    fun `l'historique commence a l'etat initial`() {
        val h = ImageEditHistory()
        assertThat(h.count).isEqualTo(1)
        assertThat(h.current).isEqualTo(ImageEditState.IDENTITY)
        assertThat(h.canUndo).isFalse()
        assertThat(h.canRedo).isFalse()
    }

    @Test
    fun `record ignore un etat identique a l'actuel`() {
        val h = ImageEditHistory().record(sepia, "Sepia").record(sepia, "Sepia")
        assertThat(h.count).isEqualTo(2)
    }

    @Test
    fun `un glisse qui finit ou il a commence reste hors historique`() {
        val h = ImageEditHistory().record(ImageEditState.IDENTITY, "Luminosite")
        assertThat(h.count).isEqualTo(1)
    }

    @Test
    fun `undo puis redo parcourent les pas`() {
        val h = ImageEditHistory().record(sepia, "a").record(noir, "b")
        val u = h.undo()!!
        assertThat(u.current).isEqualTo(sepia)
        assertThat(u.canRedo).isTrue()
        assertThat(u.redo()!!.current).isEqualTo(noir)
    }

    @Test
    fun `undo au debut et redo a la fin rendent null`() {
        assertThat(ImageEditHistory().undo()).isNull()
        assertThat(ImageEditHistory().record(sepia, "a").redo()).isNull()
    }

    @Test
    fun `record apres undo rejette la branche en avant`() {
        val h = ImageEditHistory().record(sepia, "a").record(noir, "b").undo()!!.record(grain, "c")
        assertThat(h.count).isEqualTo(3)
        assertThat(h.canRedo).isFalse()
        assertThat(h.steps.map { it.label }).containsExactly("Original", "a", "c").inOrder()
    }

    @Test
    fun `jump saute a un pas par id et garde la branche`() {
        val h = ImageEditHistory().record(sepia, "a").record(noir, "b")
        val firstId = h.steps[1].id
        val j = h.jump(firstId)!!
        assertThat(j.current).isEqualTo(sepia)
        assertThat(j.canRedo).isTrue()
        assertThat(j.currentStepId).isEqualTo(firstId)
        assertThat(h.jump(-99L)).isNull()
    }

    @Test
    fun `les identifiants de pas restent uniques apres une branche rejetee`() {
        val h = ImageEditHistory().record(sepia, "a").record(noir, "b").undo()!!.record(grain, "c")
        assertThat(h.steps.map { it.id }.toSet()).hasSize(3)
    }

    @Test
    fun `les libelles sont conserves`() {
        val h = ImageEditHistory(initialLabel = "Original").record(sepia, "Sepia")
        assertThat(h.steps.map { it.label }).containsExactly("Original", "Sepia").inOrder()
    }
}
