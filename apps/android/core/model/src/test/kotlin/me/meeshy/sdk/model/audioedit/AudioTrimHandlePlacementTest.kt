package me.meeshy.sdk.model.audioedit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AudioTrimHandlePlacementTest {

    private fun place(raw: Float) = AudioTrimHandlePlacement.of(rawX = raw, stripWidth = 300f, handleWidth = 26f)

    @Test
    fun `dans le champ la poignee reste a sa place sans fleche`() {
        val p = place(120f)
        assertThat(p.centerX).isEqualTo(120f)
        assertThat(p.arrow).isEqualTo(AudioTrimHandlePlacement.Arrow.NONE)
    }

    @Test
    fun `a gauche du champ elle est ramenee au bord avec une fleche vers la gauche`() {
        val p = place(-40f)
        assertThat(p.centerX).isEqualTo(13f)
        assertThat(p.arrow).isEqualTo(AudioTrimHandlePlacement.Arrow.LEFT)
    }

    @Test
    fun `a droite du champ elle est ramenee au bord avec une fleche vers la droite`() {
        val p = place(500f)
        assertThat(p.centerX).isEqualTo(287f)
        assertThat(p.arrow).isEqualTo(AudioTrimHandlePlacement.Arrow.RIGHT)
    }

    @Test
    fun `une bande plus etroite que la poignee ne produit jamais de position hors bande`() {
        val p = AudioTrimHandlePlacement.of(rawX = 900f, stripWidth = 10f, handleWidth = 26f)
        assertThat(p.centerX).isEqualTo(13f)
    }
}
