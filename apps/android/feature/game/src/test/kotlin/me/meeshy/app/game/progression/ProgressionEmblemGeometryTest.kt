package me.meeshy.app.game.progression

import androidx.compose.ui.geometry.Offset
import me.meeshy.sdk.model.game.FlameFormKey
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * La géométrie des emblèmes, nombre pour nombre celle d'iOS (`ConceptEmblemDesign`, `FlameView`, `ChestView`,
 * `TrophyView`, `AtlasStampView`) : une table, pas du dessin — la vue la parcourt.
 */
class ProgressionEmblemGeometryTest {

    @Test
    fun `les points sont un jeton indigo a etincelle d or`() {
        val design = ConceptMarkDesign.of(ConceptMarkKind.Points)
        assertEquals(ConceptMarkDesign.Paint.Indigo, design.paint)
        assertEquals(ConceptMarkDesign.Body.Circle(Offset(34f, 38f), 28f), design.body)
        assertEquals(ConceptMarkDesign.Signature(Offset(34f, 38f), size = 38f, strokeWidth = 100f), design.signature)
        val spark = design.accent as ConceptMarkDesign.Accent.Spark
        assertEquals(8, spark.points.size)
        assertEquals(Offset(56f, 4f), spark.points.first())
        assertEquals(Offset(68f, 16f), spark.points[2])
    }

    @Test
    fun `les elans sont un panneau de flamme a chevron qui monte`() {
        val design = ConceptMarkDesign.of(ConceptMarkKind.Elans)
        assertEquals(ConceptMarkDesign.Paint.Flame, design.paint)
        assertEquals(ConceptMarkDesign.Body.Panel(left = 8f, top = 8f, side = 56f, radius = 18f), design.body)
        assertEquals(ConceptMarkDesign.Signature(Offset(36f, 47f), size = 32f, strokeWidth = 104f), design.signature)
        assertEquals(
            ConceptMarkDesign.Accent.Chevron(listOf(Offset(23f, 30f), Offset(36f, 17f), Offset(49f, 30f)), lineWidth = 6f),
            design.accent,
        )
    }

    @Test
    fun `la flamme grandit avec la serie et ne porte la Signature qu apres la braise`() {
        assertEquals(listOf(0.45f, 0.7f, 0.95f, 1f, 1f), FlameFormKey.entries.map { FlameEmblemGeometry.scale(it) })
        assertFalse(FlameEmblemGeometry.carriesSignature(FlameFormKey.Braise))
        assertTrue(FlameFormKey.entries.drop(1).all(FlameEmblemGeometry::carriesSignature))
    }

    @Test
    fun `seuls l astre et le soleil ont un halo, le soleil plus large`() {
        assertNull(FlameEmblemGeometry.haloRadius(FlameFormKey.Braise))
        assertNull(FlameEmblemGeometry.haloRadius(FlameFormKey.Flamme))
        assertNull(FlameEmblemGeometry.haloRadius(FlameFormKey.Brasier))
        assertEquals(25f, FlameEmblemGeometry.haloRadius(FlameFormKey.Astre))
        assertEquals(31f, FlameEmblemGeometry.haloRadius(FlameFormKey.Soleil))
    }

    @Test
    fun `les boites sont celles d iOS`() {
        assertEquals(72f, ConceptMarkDesign.BOX)
        assertEquals(90f / 72f, ChestEmblemGeometry.ASPECT)
        assertEquals(120f / 124f, CupEmblemGeometry.ASPECT)
    }

    @Test
    fun `le tampon dit deux points quand la langue manque`() {
        assertEquals("··", AtlasStampGeometry.label(""))
        assertEquals("JA", AtlasStampGeometry.label("ja"))
    }
}
