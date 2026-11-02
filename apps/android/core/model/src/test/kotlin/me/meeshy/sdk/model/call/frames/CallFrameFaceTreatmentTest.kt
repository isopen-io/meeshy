package me.meeshy.sdk.model.call.frames

import com.google.common.truth.Truth.assertThat
import java.util.Locale
import org.junit.Test

class CallFrameFaceTreatmentTest {

    private fun person(id: String, name: String = "Ada") = CallFramePerson(id, name, null, false)

    private val texts = CallFrameTexts(groupName = "Les copains", isGroup = true, date = "22 oct.", accentHex = null)

    @Test
    fun `la couleur d origine ne change rien au visage`() {
        assertThat(CallFrameToneRecipe.of(CallFrameTone.COLOR, null).isIdentity).isTrue()
    }

    @Test
    fun `mono et luminosite grisent completement sans rien ajouter`() {
        listOf(CallFrameTone.MONO, CallFrameTone.LUMINOSITY).forEach {
            val recipe = CallFrameToneRecipe.of(it, null)
            assertThat(recipe.saturation).isEqualTo(0.0)
            assertThat(recipe.layers).isEmpty()
        }
    }

    @Test
    fun `le noir grise puis adoucit puis multiplie`() {
        val recipe = CallFrameToneRecipe.of(CallFrameTone.NOIR, null)
        assertThat(recipe.saturation).isEqualTo(0.0)
        assertThat(recipe.layers.map { it.blend })
            .containsExactly(CallFrameToneBlend.SOFT_LIGHT, CallFrameToneBlend.MULTIPLY).inOrder()
    }

    @Test
    fun `le froid garde presque toute sa couleur et le fane la delave a trente pour cent`() {
        assertThat(CallFrameToneRecipe.of(CallFrameTone.COOL, null).saturation).isWithin(1e-9).of(0.88)
        assertThat(CallFrameToneRecipe.of(CallFrameTone.FADED, null).saturation).isWithin(1e-9).of(0.7)
    }

    @Test
    fun `le duotone multiplie par la lumiere puis eclaircit par l ombre et prend sa paire par defaut`() {
        val custom = CallFrameToneRecipe.of(CallFrameTone.DUOTONE, CallFrameDuotone(shadow = "#000000", light = "#FFFFFF"))
        assertThat(custom.layers.map { it.blend }).containsExactly(CallFrameToneBlend.MULTIPLY, CallFrameToneBlend.LIGHTEN).inOrder()
        assertThat(custom.layers[0].color.red).isEqualTo(1.0)
        val default = CallFrameToneRecipe.of(CallFrameTone.DUOTONE, null)
        assertThat(default.layers[1].color).isEqualTo(CallFrameRenderKit.color("#1E1B4B"))
    }

    @Test
    fun `chaque ton a une recette`() {
        CallFrameTone.entries.forEach { assertThat(CallFrameToneRecipe.of(it, null)).isNotNull() }
    }

    @Test
    fun `un fond uni, lineaire, radial ou accent a son plan`() {
        val solid = CallFrameBackdropGeometry.plan(CallFrameBackground.Solid("#112233"), null, 100.0, 200.0)
        assertThat(solid).isInstanceOf(CallFrameBackdropPlan.Solid::class.java)
        val radial = CallFrameBackdropGeometry.plan(CallFrameBackground.Radial(listOf("#000000", "#FFFFFF")), null, 100.0, 200.0)
            as CallFrameBackdropPlan.Radial
        assertThat(radial.cx).isEqualTo(50.0)
        assertThat(radial.radius).isWithin(1e-9).of(Math.hypot(100.0, 200.0) / 2)
    }

    @Test
    fun `le fond accent prend l accent de la conversation sinon l indigo`() {
        val own = CallFrameBackdropGeometry.plan(CallFrameBackground.Accent, CallFrameAccent("#FF0000", "#00FF00"), 100.0, 200.0)
            as CallFrameBackdropPlan.Accent
        assertThat(own.gradient.colors[1]).isEqualTo(CallFrameRenderKit.color("#FF0000"))
        val fallback = CallFrameBackdropGeometry.plan(CallFrameBackground.Accent, null, 100.0, 200.0) as CallFrameBackdropPlan.Accent
        assertThat(fallback.gradient.colors[1]).isEqualTo(CallFrameRenderKit.color("#6366F1"))
        assertThat(fallback.gradient.colors[2]).isEqualTo(CallFrameRenderKit.color("#4338CA"))
        assertThat(fallback.light.colors[1].alpha).isEqualTo(0.0)
    }

    @Test
    fun `l axe d un degrade couvre exactement la toile`() {
        val ends = CallFrameBackdropGeometry.linearEnds(100.0, 200.0, 0.0)
        assertThat(ends.x0).isWithin(1e-9).of(50.0)
        assertThat(ends.y0).isWithin(1e-9).of(0.0)
        assertThat(ends.y1).isWithin(1e-9).of(200.0)
    }

    @Test
    fun `une seule couleur de degrade est doublee`() {
        assertThat(CallFrameBackdropGeometry.stops(1)).containsExactly(0.0, 1.0).inOrder()
        assertThat(CallFrameBackdropGeometry.stops(3)).containsExactly(0.0, 0.5, 1.0).inOrder()
        assertThat(CallFrameBackdropGeometry.stops(0)).isEmpty()
    }

    @Test
    fun `le portrait absent a toujours un degrade et une initiale`() {
        assertThat(CallFramePlaceholder.hash("a")).isEqualTo(7L * 31 + 97)
        assertThat(CallFramePlaceholder.hues("a")).isEqualTo("#14B8A6" to "#22C55E")
        assertThat(CallFramePlaceholder.hues("a")).isEqualTo(CallFramePlaceholder.hues("a"))
        assertThat(CallFramePlaceholder.initial("  éloïse", Locale.FRENCH)).isEqualTo("É")
        assertThat(CallFramePlaceholder.initial("   ")).isNull()
    }

    @Test
    fun `le hash des portraits ne devient jamais negatif`() {
        val long = "x".repeat(200)
        assertThat(CallFramePlaceholder.hash(long)).isAtLeast(0L)
        assertThat(CallFramePlaceholder.hash(long)).isAtMost(0xFFFFFFFFL)
    }

    @Test
    fun `la cle de scene change avec le cadre, les personnes, les textes, la taille et les bandes`() {
        val base = CallFrameLayerKey.of("f.a.duo", listOf(person("1"), person("2")), texts, 1080.0, 1920.0)
        assertThat(CallFrameLayerKey.of("f.a.duo", listOf(person("1"), person("2")), texts, 1080.0, 1920.0)).isEqualTo(base)
        assertThat(CallFrameLayerKey.of("f.b.duo", listOf(person("1"), person("2")), texts, 1080.0, 1920.0)).isNotEqualTo(base)
        assertThat(CallFrameLayerKey.of("f.a.duo", listOf(person("1"), person("3")), texts, 1080.0, 1920.0)).isNotEqualTo(base)
        assertThat(CallFrameLayerKey.of("f.a.duo", listOf(person("1"), person("2", "Zoé")), texts, 1080.0, 1920.0)).isNotEqualTo(base)
        assertThat(CallFrameLayerKey.of("f.a.duo", listOf(person("1"), person("2")), texts.copy(date = "23 oct."), 1080.0, 1920.0)).isNotEqualTo(base)
        assertThat(CallFrameLayerKey.of("f.a.duo", listOf(person("1"), person("2")), texts, 108.0, 192.0)).isNotEqualTo(base)
        assertThat(
            CallFrameLayerKey.of("f.a.duo", listOf(person("1"), person("2")), texts, 1080.0, 1920.0, CallFrameChromeReserve(0.1, 0.0)),
        ).isNotEqualTo(base)
        assertThat(
            CallFrameLayerKey.of("f.a.duo", listOf(person("1"), person("2")), texts, 1080.0, 1920.0, extras = "ornaments:v2"),
        ).isNotEqualTo(base)
    }

    @Test
    fun `la cle de scene ignore une taille qui ne change qu apres la virgule`() {
        val a = CallFrameLayerKey.of("f", emptyList(), texts, 1080.2, 1920.4)
        val b = CallFrameLayerKey.of("f", emptyList(), texts, 1079.9, 1920.0)
        assertThat(a).isEqualTo(b)
    }
}
