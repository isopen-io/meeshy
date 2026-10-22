package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class SceneShapeTest {
    private val json = Json { ignoreUnknownKeys = true }

    private fun obj(raw: String) = json.decodeFromString(ObjectV3.serializer(), raw)

    private fun scene(vararg objets: String) = SceneV3(id = "s", objects = objets.map(::obj))

    private fun fond(aspect: Double, fit: Boolean = true) = """{"id":"bg","kind":"media","plane":"bg","payload":{
        "mediaURL":"https://x/y.jpg","aspectRatio":$aspect${if (fit) ""","transform":{"videoFitMode":"fit"}""" else ""}}}"""

    @Test
    fun `un panorama occupe une bande horizontale centrale`() {
        val zone = SceneShape.mediaBand(16.0 / 9.0)
        assertThat(zone.left).isEqualTo(0.0)
        assertThat(zone.right).isEqualTo(1.0)
        assertThat(zone.top).isGreaterThan(0.3)
        assertThat(zone.height).isWithin(1e-9).of((9.0 / 16.0) / (16.0 / 9.0))
        assertThat(zone.top + zone.bottom).isWithin(1e-9).of(1.0)
    }

    @Test
    fun `un portrait etroit occupe une bande verticale centrale`() {
        val zone = SceneShape.mediaBand(0.4)
        assertThat(zone.top).isEqualTo(0.0)
        assertThat(zone.bottom).isEqualTo(1.0)
        assertThat(zone.width).isWithin(1e-9).of(0.4 / (9.0 / 16.0))
        assertThat(zone.left + zone.right).isWithin(1e-9).of(1.0)
    }

    @Test
    fun `un ratio 9 16 ou invalide occupe toute la scene`() {
        assertThat(SceneShape.mediaBand(9.0 / 16.0)).isEqualTo(SceneShape.UNIT_RECT)
        assertThat(SceneShape.mediaBand(Double.NaN)).isEqualTo(SceneShape.UNIT_RECT)
        assertThat(SceneShape.mediaBand(-1.0)).isEqualTo(SceneShape.UNIT_RECT)
    }

    @Test
    fun `un fond rempli ou sans ratio n a pas de bande`() {
        assertThat(SceneShape.mediaBand(scene(fond(1.78, fit = false)))).isEqualTo(SceneShape.UNIT_RECT)
        assertThat(SceneShape.mediaBand(scene())).isNull()
    }

    @Test
    fun `le cadre est binaire - bande quand rien ne deborde`() {
        val seule = scene(fond(1.78))
        val cadre = SceneShape.frame(seule)
        assertThat(cadre).isInstanceOf(SceneShape.Frame.MediaBand::class.java)
        assertThat(cadre.tightensAnything).isTrue()
    }

    @Test
    fun `le cadre est binaire - scene entiere des qu un objet peint hors de la bande`() {
        val texteHaut = """{"id":"t","kind":"text","anchor":{"t":"free","x":0.5,"y":0.05},"payload":{"text":"x"}}"""
        val cadre = SceneShape.frame(scene(fond(1.78), texteHaut))
        assertThat(cadre).isEqualTo(SceneShape.Frame.WholeScene)
        assertThat(cadre.tightensAnything).isFalse()
    }

    @Test
    fun `un objet qui ne peint rien ne desserre pas le cadre`() {
        val audio = """{"id":"a","kind":"audio","anchor":{"t":"free","x":0.5,"y":0.02},"payload":{}}"""
        val futur = """{"id":"f","kind":"poll","anchor":{"t":"free","x":0.5,"y":0.02},"payload":{}}"""
        assertThat(SceneShape.frame(scene(fond(1.78), audio, futur))).isInstanceOf(SceneShape.Frame.MediaBand::class.java)
    }

    @Test
    fun `une bande sans objet hors zone se resserre sur le media - un objet central y reste`() {
        val centre = """{"id":"t","kind":"sticker","anchor":{"t":"free","x":0.5,"y":0.5},"payload":{"emoji":"x"}}"""
        assertThat(SceneShape.frame(scene(fond(1.78), centre)).rect.height).isLessThan(1.0)
    }

    @Test
    fun `la boite d un objet tourne et grandit avec l echelle`() {
        val droit = SceneShape.anchorBox(obj("""{"id":"s","kind":"sticker","anchor":{"t":"free","x":0.5,"y":0.5},"payload":{}}"""))
        val grand = SceneShape.anchorBox(
            obj("""{"id":"s","kind":"sticker","anchor":{"t":"free","x":0.5,"y":0.5},"transform":{"scale":2},"payload":{}}"""),
        )
        assertThat(grand.width).isGreaterThan(droit.width)
        val bandeHaute = SceneShape.anchorBox(obj("""{"id":"b","kind":"text","anchor":{"t":"band","edge":"top"},"payload":{}}"""))
        assertThat(bandeHaute.top + bandeHaute.bottom).isWithin(1e-9).of(2 * SceneShape.BAND_TOP_Y)
    }

}
