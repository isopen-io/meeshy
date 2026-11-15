package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.StoryTextObject
import org.junit.Test

class SceneHitTesterTest {

    private val canvas = CanvasSize(1000.0, 2000.0)

    // Chaque objet fait 200 x 100 px à l'échelle 1, quelle que soit sa famille.
    private val box = { _: MeeshySceneObject -> CanvasSize(200.0, 100.0) }

    private fun text(id: String, x: Double = 0.5, y: Double = 0.5, z: Int = 0, scale: Double = 1.0, rotation: Double = 0.0, locked: Boolean? = null) =
        StoryTextObject(id = id, x = x, y = y, zIndex = z, scale = scale, rotation = rotation, isLocked = locked)

    private fun hit(lists: SceneLists, px: Double, py: Double, slop: Double = 0.0) =
        SceneHitTester.hit(lists, px, py, canvas, minTouchPx = slop, sizeOf = box)

    @Test
    fun `le centre d'un objet le touche, un point loin de lui ne touche rien`() {
        val lists = SceneLists(texts = listOf(text("a")))
        assertThat(hit(lists, 500.0, 1000.0)?.id).isEqualTo("a")
        assertThat(hit(lists, 100.0, 100.0)).isNull()
    }

    @Test
    fun `les bords sont inclus et juste au-dela on rate`() {
        val lists = SceneLists(texts = listOf(text("a")))
        assertThat(hit(lists, 600.0, 1000.0)?.id).isEqualTo("a")
        assertThat(hit(lists, 600.5, 1000.0)).isNull()
        assertThat(hit(lists, 500.0, 1050.0)?.id).isEqualTo("a")
        assertThat(hit(lists, 500.0, 1051.0)).isNull()
    }

    @Test
    fun `l'echelle agrandit la zone touchable`() {
        val lists = SceneLists(texts = listOf(text("a", scale = 2.0)))
        assertThat(hit(lists, 690.0, 1000.0)?.id).isEqualTo("a")
        assertThat(hit(lists, 710.0, 1000.0)).isNull()
    }

    @Test
    fun `la rotation fait tourner la zone touchable`() {
        val lists = SceneLists(texts = listOf(text("a", rotation = 90.0)))
        // tournée de 90 degres : 100 de large, 200 de haut
        assertThat(hit(lists, 500.0, 1090.0)?.id).isEqualTo("a")
        assertThat(hit(lists, 590.0, 1000.0)).isNull()
        assertThat(hit(lists, 540.0, 1000.0)?.id).isEqualTo("a")
    }

    @Test
    fun `l'objet le plus haut en z gagne quand deux se recouvrent`() {
        val lists = SceneLists(texts = listOf(text("bas", z = 1), text("haut", z = 5)))
        assertThat(hit(lists, 500.0, 1000.0)?.id).isEqualTo("haut")
    }

    @Test
    fun `a z egal le dernier de la liste gagne et l'ordre de famille est stable`() {
        val lists = SceneLists(
            texts = listOf(text("t")),
            stickers = listOf(StorySticker(id = "s", x = 0.5, y = 0.5)),
        )
        assertThat(hit(lists, 500.0, 1000.0)?.id).isEqualTo("s")
    }

    @Test
    fun `un objet couvert laisse passer le toucher a celui du dessous hors de sa zone`() {
        val lists = SceneLists(texts = listOf(text("bas", z = 1, x = 0.5), text("haut", z = 2, x = 0.8)))
        assertThat(hit(lists, 450.0, 1000.0)?.id).isEqualTo("bas")
    }

    @Test
    fun `un fond n'est jamais touche`() {
        val lists = SceneLists(medias = listOf(StoryMediaObject(id = "bg", isBackground = true)))
        assertThat(hit(lists, 500.0, 1000.0)).isNull()
    }

    @Test
    fun `la taille minimale tactile elargit une petite cible`() {
        val tiny = { _: MeeshySceneObject -> CanvasSize(10.0, 10.0) }
        val lists = SceneLists(texts = listOf(text("a")))
        assertThat(SceneHitTester.hit(lists, 520.0, 1000.0, canvas, minTouchPx = 48.0, sizeOf = tiny)?.id).isEqualTo("a")
        assertThat(SceneHitTester.hit(lists, 520.0, 1000.0, canvas, minTouchPx = 0.0, sizeOf = tiny)).isNull()
    }

    @Test
    fun `un objet verrouille est trouve mais declare verrouille`() {
        val lists = SceneLists(texts = listOf(text("a", locked = true), text("b")))
        assertThat(SceneHitTester.isLocked(lists.sceneObject("a")!!)).isTrue()
        assertThat(SceneHitTester.isLocked(lists.sceneObject("b")!!)).isFalse()
    }

    @Test
    fun `la cible suit la couche manipulable`() {
        val bg = StoryMediaObject(id = "bg", isBackground = true)
        val lists = SceneLists(medias = listOf(bg), texts = listOf(text("a")))
        val at = { layer: SceneManipulationLayer ->
            SceneHitTester.target(lists, layer, 500.0, 1000.0, canvas, sizeOf = box)
        }
        assertThat(at(SceneManipulationLayer.CANVAS)).isNull()
        assertThat(at(SceneManipulationLayer.BACKGROUND)?.id).isEqualTo("bg")
        assertThat(at(SceneManipulationLayer.FOREGROUND)?.id).isEqualTo("a")
    }

    @Test
    fun `au premier plan un raté ne retombe pas sur le fond`() {
        val bg = StoryMediaObject(id = "bg", isBackground = true)
        val lists = SceneLists(medias = listOf(bg), texts = listOf(text("a")))
        assertThat(SceneHitTester.target(lists, SceneManipulationLayer.FOREGROUND, 50.0, 50.0, canvas, sizeOf = box)).isNull()
    }

    @Test
    fun `la taille par defaut d'un sticker suit sa base et la largeur du canevas`() {
        val sticker = MeeshySceneObject.Sticker(StorySticker(id = "s", baseSize = 108.0))
        val size = SceneHitTester.defaultSize(sticker, canvasWidth = 540.0)
        assertThat(size.width).isWithin(1e-6).of(54.0)
        assertThat(size.height).isWithin(1e-6).of(54.0)
    }
}
