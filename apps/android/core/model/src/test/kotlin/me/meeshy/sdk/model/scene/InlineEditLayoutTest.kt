package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class InlineEditLayoutTest {
    private fun zone(top: Float? = 100f, tools: Float? = null, ime: Float? = null, canvas: Float = 1600f) =
        InlineEditLayout.zone(top, tools, ime, canvas, gap = 12f, minHeight = 44f)

    @Test
    fun `la bande va du bas du bouton Termine au bord du canvas quand le clavier est ferme`() {
        val z = zone()!!
        assertThat(z.top).isEqualTo(112f)
        assertThat(z.bottom).isEqualTo(1588f)
    }

    @Test
    fun `clavier ouvert la bande s'arrete au haut du clavier`() {
        val z = zone(ime = 900f)!!
        assertThat(z.bottom).isEqualTo(888f)
        assertThat(z.midY).isEqualTo((112f + 888f) / 2f)
    }

    @Test
    fun `la plus haute des bornes du bas gagne entre outils et clavier`() {
        assertThat(zone(tools = 700f, ime = 900f)!!.bottom).isEqualTo(688f)
        assertThat(zone(tools = 1000f, ime = 900f)!!.bottom).isEqualTo(888f)
    }

    @Test
    fun `une borne du bas hors canvas ne depasse jamais le canvas`() {
        assertThat(zone(ime = 5000f)!!.bottom).isEqualTo(1588f)
    }

    @Test
    fun `une bande trop etroite est ecartee`() {
        assertThat(zone(top = 880f, ime = 900f)).isNull()
        assertThat(zone(top = 900f, ime = 880f)).isNull()
    }

    @Test
    fun `le texte est centre dans la bande jamais sous le clavier`() {
        val z = zone(ime = 900f)
        val placement = InlineEditLayout.place(z, canvasWidth = 900f, canvasHeight = 1600f, naturalHeight = 120f)
        assertThat(placement.centerX).isEqualTo(450f)
        assertThat(placement.centerY).isEqualTo(500f)
        assertThat(placement.centerY + placement.visibleHeight / 2f).isLessThan(900f)
    }

    @Test
    fun `sans bande mesuree le texte reste au centre du canvas`() {
        val placement = InlineEditLayout.place(null, 900f, 1600f, 120f)
        assertThat(placement.centerY).isEqualTo(800f)
        assertThat(placement.visibleHeight).isEqualTo(120f)
    }

    @Test
    fun `le centre ne depend pas de la hauteur du bloc`() {
        val z = zone(ime = 900f)
        val short = InlineEditLayout.place(z, 900f, 1600f, 40f)
        val tall = InlineEditLayout.place(z, 900f, 1600f, 400f)
        assertThat(short.centerY).isEqualTo(tall.centerY)
    }

    @Test
    fun `un texte tres long est borne a la hauteur de la bande`() {
        val z = zone(ime = 900f)!!
        val placement = InlineEditLayout.place(z, 900f, 1600f, 5000f)
        assertThat(placement.visibleHeight).isEqualTo(z.height)
    }

    @Test
    fun `des bornes croisees donnent une hauteur nulle`() {
        assertThat(InlineEditZone(top = 500f, bottom = 300f).height).isEqualTo(0f)
    }
}
