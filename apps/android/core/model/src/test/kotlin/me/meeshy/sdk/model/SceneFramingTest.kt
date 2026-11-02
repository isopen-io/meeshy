package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * #14199 — miroir de `SceneFramingTests` (iOS) : une carte de fil cadre la scène sur ce qu'elle MONTRE, la bande d'un média
 * de fond unie aux ancres des objets visibles, toujours en pleine largeur, jamais sur un objet qui ne peint rien.
 */
class SceneFramingTest {
    private val json = Json { ignoreUnknownKeys = true }

    private fun obj(raw: String) = json.decodeFromString(ObjectV3.serializer(), raw)

    private fun scene(vararg objets: String) = SceneV3(id = "s", objects = objets.map(::obj))

    private fun fond(aspect: Double, extra: String = "") =
        """{"id":"photo","kind":"media","plane":"content","payload":{"isBackground":true,"mediaURL":"https://x/y.jpg","aspectRatio":$aspect$extra}}"""

    private fun objet(kind: String, x: Double = 0.5, y: Double = 0.5, scale: Double = 1.0, id: String = "$kind-$x-$y") =
        """{"id":"$id","kind":"$kind","anchor":{"t":"free","x":$x,"y":$y},"plane":"fg","transform":{"scale":$scale}}"""

    private val paysage = 16.0 / 9.0

    @Test
    fun `une image paysage seule se cadre sur sa bande, pleine largeur et centree`() {
        val cadre = requireNotNull(SceneFraming.focus(scene(fond(paysage))))

        assertThat(cadre.width).isWithin(1e-9).of(1.0)
        assertThat(cadre.height).isLessThan(0.6)
        assertThat((cadre.top + cadre.bottom) / 2).isWithin(1e-9).of(0.5)
    }

    @Test
    fun `une image au gabarit de la scene ou de forme inconnue ne resserre rien`() {
        assertThat(SceneFraming.focus(scene(fond(9.0 / 16.0)))).isNull()
        assertThat(SceneFraming.focus(scene("""{"id":"photo","kind":"media","plane":"bg","payload":{"mediaURL":"https://x/y.jpg"}}"""))).isNull()
    }

    @Test
    fun `un son et une mention n elargissent pas le cadre, un texte hors de la bande oui`() {
        val seule = requireNotNull(SceneFraming.focus(scene(fond(paysage))))
        val accompagnee = SceneFraming.focus(scene(fond(paysage), objet("audio", y = 0.05), objet("mention", y = 0.95)))
        val surmontee = requireNotNull(SceneFraming.focus(scene(fond(paysage), objet("text", y = 0.06))))

        assertThat(accompagnee).isEqualTo(seule)
        assertThat(surmontee.top).isLessThan(seule.top)
        assertThat(surmontee.height).isGreaterThan(seule.height)
    }

    @Test
    fun `un fond uni avec un texte en haut se cadre sur le texte`() {
        val cadre = requireNotNull(SceneFraming.focus(scene(objet("text", y = 0.22))))

        assertThat((cadre.top + cadre.bottom) / 2).isLessThan(0.5)
        assertThat(cadre.height).isLessThan(1.0)
        assertThat(cadre.width).isWithin(1e-9).of(1.0)
    }

    @Test
    fun `une scene vide ou seulement sonore ne se cadre pas`() {
        assertThat(SceneFraming.focus(scene())).isNull()
        assertThat(SceneFraming.focus(scene(objet("audio")))).isNull()
        assertThat(SceneFraming.showsSomething(scene(objet("audio")))).isFalse()
    }

    @Test
    fun `un sticker seul ne produit pas un zoom absurde`() {
        val cadre = requireNotNull(SceneFraming.focus(scene(objet("sticker", scale = 0.5))))

        assertThat(cadre.height).isAtLeast(SceneFraming.MINIMUM_SIDE - 0.001)
    }

    @Test
    fun `un objet au bord fait glisser le cadre dans la scene sans le rogner`() {
        val cadre = requireNotNull(SceneFraming.focus(scene(objet("sticker", y = 0.99, scale = 0.5))))

        assertThat(cadre.bottom).isWithin(1e-9).of(1.0)
        assertThat(cadre.top).isAtLeast(0.0)
    }

    @Test
    fun `le rapport de la carte se derive du cadre`() {
        val cadre = requireNotNull(SceneFraming.focus(scene(fond(paysage))))

        assertThat(SceneFraming.cardAspect(scene(fond(paysage)))).isWithin(1e-9).of(SceneShape.ASPECT / cadre.height)
        assertThat(SceneFraming.cardAspect(scene(fond(paysage)))).isWithin(1e-6).of(paysage)
        assertThat(SceneFraming.cardAspect(scene())).isNull()
    }

    @Test
    fun `une scene qui n est qu une image intacte se montre a son rapport, sans fenetre de cadrage`() {
        val image = scene(fond(paysage))
        val retouchee = scene(fond(paysage, extra = ""","cropX":0.1,"cropY":0.0,"cropW":0.8,"cropH":1.0"""))
        val legendee = scene(fond(paysage), objet("text", y = 0.5))

        assertThat(SceneFraming.imageAspect(image)).isWithin(1e-9).of(paysage)
        assertThat(SceneFraming.cardFocus(image)).isNull()
        assertThat(SceneFraming.imageAspect(retouchee)).isNull()
        assertThat(SceneFraming.cardFocus(retouchee)).isNotNull()
        assertThat(SceneFraming.imageAspect(legendee)).isNull()
        assertThat(SceneFraming.cardFocus(legendee)).isNotNull()
    }

    @Test
    fun `un fond uni avec un objet dans le tiers haut se cadre sur lui`() {
        val cadre = requireNotNull(SceneFraming.cardFocus(scene(objet("sticker", y = 0.2))))

        assertThat(cadre.top).isAtMost(0.2)
        assertThat(cadre.bottom).isAtLeast(0.2)
        assertThat(cadre.bottom).isLessThan(0.5)
    }

    @Test
    fun `la fenetre de cadrage couvre la boite et y centre la zone, a l echelle de la scene`() {
        val zone = SceneRect(0.0, 0.1, 1.0, 0.4)
        val boite = SceneFraming.placement(zone, boxWidth = 300.0, boxHeight = 300.0)

        assertThat(boite.height / boite.width).isWithin(1e-9).of(1 / SceneShape.ASPECT)
        assertThat(boite.width * zone.width).isAtLeast(300.0 - 1e-9)
        assertThat(boite.height * zone.height).isAtLeast(300.0 - 1e-9)
        val milieu = boite.y + boite.height * (zone.top + zone.bottom) / 2
        assertThat(milieu).isWithin(1e-6).of(150.0)
        val centreX = boite.x + boite.width * 0.5
        assertThat(centreX).isWithin(1e-6).of(150.0)
    }

    @Test
    fun `une tuile garde l echelle qui la couvre et glisse vers la zone, la ou le centre la coupe`() {
        val haut = SceneRect(0.0, 0.0, 1.0, 0.42)
        val cadree = SceneFraming.tilePlacement(haut, boxWidth = 200.0, boxHeight = 260.0)
        val centree = SceneFraming.tilePlacement(null, boxWidth = 200.0, boxHeight = 260.0)

        assertThat(cadree.width).isWithin(1e-9).of(200.0)
        assertThat(cadree.width).isEqualTo(centree.width)
        assertThat(cadree.y).isWithin(1e-9).of(0.0)
        assertThat(cadree.y + 0.1 * cadree.height).isAtLeast(0.0)
        assertThat(centree.y + 0.1 * centree.height).isLessThan(0.0)
        assertThat(cadree.y + cadree.height).isAtLeast(260.0)
    }

    @Test
    fun `le carrousel prend la forme de sa page la plus haute, le gabarit sans cadrage`() {
        val paysageScene = scene(fond(paysage))
        val portraitScene = scene(fond(0.75))
        val texteScene = scene(objet("text", y = 0.5, scale = 3.0))

        assertThat(SceneCarouselLayout.cardAspect(listOf(paysageScene, portraitScene))).isWithin(1e-6).of(0.75)
        assertThat(SceneCarouselLayout.pageAspect(scene())).isNull()
        assertThat(SceneCarouselLayout.cardAspect(listOf(scene()))).isWithin(1e-9).of(SceneShape.ASPECT)
        assertThat(SceneCarouselLayout.pageAspect(texteScene)).isNotNull()
    }

    @Test
    fun `le plafond de hauteur ne touche pas un rapport deja court et borne le gabarit entier`() {
        assertThat(SceneFraming.MIN_CARD_ASPECT).isWithin(1e-9).of(1 / 1.4)
        assertThat(SceneFraming.clampedCardAspect(paysage)).isEqualTo(paysage)
        assertThat(SceneFraming.clampedCardAspect(SceneShape.ASPECT)).isWithin(1e-9).of(1 / 1.4)
    }
}
