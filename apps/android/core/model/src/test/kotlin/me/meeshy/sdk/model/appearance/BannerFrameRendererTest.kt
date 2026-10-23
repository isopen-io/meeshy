package me.meeshy.sdk.model.appearance

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.appearance.AppearanceFixtures.frameJson
import me.meeshy.sdk.model.appearance.AppearanceFixtures.parse
import me.meeshy.sdk.model.appearance.AppearanceFixtures.with
import org.junit.Test

class BannerFrameRendererTest {

    private fun frame(json: kotlinx.serialization.json.JsonObject = frameJson()): BannerFrameDesign =
        AppearanceFixtures.json.decodeFromString(BannerFrameDesign.serializer(), json.toString())

    private fun friezeFrame(fit: String, module: Double, from: Double, to: Double): BannerFrameDesign =
        frame(
            frameJson().with(
                "pieces" to AppearanceFixtures.array(),
                "friezes" to AppearanceFixtures.array(
                    parse(
                        """{"module":$module,"from":$from,"to":$to,"fit":"$fit",
                        "paths":[{"d":"M0 5H${module.toInt()}","color":2,"opacity":1,"width":0.5}]}""",
                    ),
                ),
            ),
        )

    private fun pieceFrame(anchor: String): BannerFrameDesign = frame(
        frameJson().with(
            "friezes" to AppearanceFixtures.array(),
            "pieces" to AppearanceFixtures.array(
                parse("""{"anchor":"$anchor","paths":[{"d":"M0 0H14V14H0Z","color":2,"opacity":1,"group":"coin"}]}"""),
            ),
        ),
    )

    @Test
    fun `la largeur logique suit le rapport largeur sur hauteur de la bannière`() {
        assertThat(BannerFrameRenderer.logicalWidth(900.0, 300.0)).isWithin(1e-9).of(300.0)
        assertThat(BannerFrameRenderer.logicalWidth(1200.0, 300.0)).isWithin(1e-9).of(400.0)
        assertThat(BannerFrameRenderer.logicalWidth(900.0, 0.0)).isEqualTo(300.0)
    }

    @Test
    fun `une frise repeat pose des modules entiers centres`() {
        val instances = BannerFrameRenderer.elements(friezeFrame("repeat", 20.0, 20.0, 20.0), width = 300.0)

        // span = 260 -> 13 modules, aucun reste
        assertThat(instances).hasSize(13)
        assertThat(instances.first().tx).isWithin(1e-9).of(0.0)
        assertThat(instances.last().tx).isWithin(1e-9).of(240.0)
        assertThat(instances.map { it.sx }.toSet()).containsExactly(1.0)

        val wide = BannerFrameRenderer.elements(friezeFrame("repeat", 20.0, 20.0, 20.0), width = 310.0)
        // span = 270 -> 13 modules, 10 de reste partagé
        assertThat(wide).hasSize(13)
        assertThat(wide.first().tx).isWithin(1e-9).of(5.0)
    }

    @Test
    fun `une frise justify recalcule le module pour tomber juste`() {
        val instances = BannerFrameRenderer.elements(friezeFrame("justify", 20.0, 20.0, 20.0), width = 310.0)

        // span = 270 -> 14 modules (13,5 arrondi), échelle 270 / 280
        assertThat(instances).hasSize(14)
        val scale = 270.0 / 280.0
        assertThat(instances.first().sx).isWithin(1e-9).of(scale)
        // le premier module commence exactement à `from`, le dernier finit à width - to
        assertThat(instances.first().tx + scale * 20.0).isWithin(1e-9).of(20.0)
        val last = instances.last()
        assertThat(last.tx + last.sx * (20.0 + 20.0)).isWithin(1e-9).of(310.0 - 20.0)
    }

    @Test
    fun `une frise trop courte pour son module ne pose rien`() {
        assertThat(BannerFrameRenderer.elements(friezeFrame("repeat", 60.0, 120.0, 120.0), width = 250.0)).isEmpty()
    }

    @Test
    fun `les ancrages debut centre fin deplacent la piece`() {
        assertThat(BannerFrameRenderer.elements(pieceFrame("start"), 400.0).single().tx).isEqualTo(0.0)
        assertThat(BannerFrameRenderer.elements(pieceFrame("center"), 400.0).single().tx).isEqualTo(50.0)
        assertThat(BannerFrameRenderer.elements(pieceFrame("end"), 400.0).single().tx).isEqualTo(100.0)
    }

    @Test
    fun `les frises se peignent avant les pieces`() {
        val elements = BannerFrameRenderer.elements(frame(), width = 300.0)

        val firstPiece = elements.indexOfFirst { it.path.group == "coin" }
        val lastFrieze = elements.indexOfLast { it.path.group == null }
        assertThat(lastFrieze).isLessThan(firstPiece)
    }

    @Test
    fun `les bornes d'un element suivent son ancrage et son echelle`() {
        val end = BannerFrameRenderer.elements(pieceFrame("end"), 400.0).single()

        assertThat(end.bounds).isEqualTo(FrameBounds(minX = 100.0, minY = 0.0, maxX = 114.0, maxY = 14.0))
    }

    @Test
    fun `un chemin sans point n'a pas de bornes`() {
        val design = frame(
            frameJson().with(
                "friezes" to AppearanceFixtures.array(),
                "pieces" to AppearanceFixtures.array(
                    parse("""{"anchor":"start","paths":[{"d":"Z","color":2,"opacity":1}]}"""),
                ),
            ),
        )

        assertThat(BannerFrameRenderer.elements(design, 300.0).single().bounds).isNull()
    }

    @Test
    fun `en lecture de droite a gauche chaque element est miroite dans la largeur`() {
        val start = BannerFrameRenderer.elements(pieceFrame("start"), 400.0, mirrored = true).single()
        val end = BannerFrameRenderer.elements(pieceFrame("end"), 400.0, mirrored = true).single()

        assertThat(start.bounds).isEqualTo(FrameBounds(minX = 386.0, minY = 0.0, maxX = 400.0, maxY = 14.0))
        assertThat(end.bounds).isEqualTo(FrameBounds(minX = 286.0, minY = 0.0, maxX = 300.0, maxY = 14.0))
        assertThat(start.sx).isEqualTo(-1.0)
    }

    @Test
    fun `la region dessinable est le pourtour de la bordure plus les coins et le cartouche`() {
        val region = frame().drawableRegion(300.0)

        assertThat(region.hole).isEqualTo(FrameRect(9.6, 9.6, 280.8, 80.8))
        assertThat(region.reserved).hasSize(5)
    }

    @Test
    fun `sans mouvement le plan est immobile et un twinkle anime ses cibles`() {
        assertThat(BannerFrameRenderer.plan(frame(), 300.0).isStill).isTrue()

        val moving = frame(
            frameJson().with(
                "motion" to AppearanceFixtures.array(AppearanceFixtures.motionJson("twinkle", "coin")),
            ),
        )
        val plan = BannerFrameRenderer.plan(moving, 300.0)
        assertThat(plan.isStill).isFalse()
        assertThat(plan.animated).hasSize(1)
        assertThat(plan.layers.single().chain.single().kind).isEqualTo(FrameStepKind.TWINKLE)
    }
}
