package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryTextStyleCatalogTest {
    private val iosWires = listOf(
        "bold", "neon", "typewriter", "handwriting", "classic", "calligraphy", "cartoon", "futuristic", "fantasy",
        "curve", "tag", "italic", "retro", "elegant", "poster", "bubble", "note", "brush",
    )

    @Test
    fun `the catalog holds the eighteen styles in the iOS order`() {
        assertThat(StoryTextStyleCatalog.all.map { it.wire }).containsExactlyElementsIn(iosWires).inOrder()
    }

    @Test
    fun `every wire value decodes to its own style`() {
        iosWires.forEach { assertThat(StoryTextStyleCatalog.fromWire(it).wire).isEqualTo(it) }
    }

    @Test
    fun `an unknown or absent style falls back to bold`() {
        assertThat(StoryTextStyleCatalog.fromWire("hologram")).isEqualTo(StoryTextStyleKind.BOLD)
        assertThat(StoryTextStyleCatalog.fromWire(null)).isEqualTo(StoryTextStyleKind.BOLD)
    }

    @Test
    fun `every style has a usable weight and a non-negative spacing`() {
        StoryTextStyleCatalog.all.forEach {
            assertThat(it.fontWeight).isIn(100..900)
            assertThat(it.letterSpacingEm).isAtLeast(0f)
        }
    }

    @Test
    fun `no two styles share the same look`() {
        val looks = StoryTextStyleCatalog.all.map { listOf(it.face, it.fontWeight, it.italic, it.letterSpacingEm, it.glow) }
        assertThat(looks.toSet()).hasSize(18)
    }

    @Test
    fun `only neon carries the preset glow`() {
        assertThat(StoryTextStyleCatalog.all.filter { it.glow }).containsExactly(StoryTextStyleKind.NEON)
    }

    @Test
    fun `the author weight overrides the weight of the style`() {
        assertThat(StoryTextFontSpecs.resolve("bold", "thin").fontWeight).isEqualTo(200)
        assertThat(StoryTextFontSpecs.resolve("poster", "semibold").fontWeight).isEqualTo(600)
        assertThat(StoryTextFontSpecs.resolve("classic", "bold").fontWeight).isEqualTo(700)
    }

    @Test
    fun `an absent or unknown author weight keeps the weight of the style`() {
        assertThat(StoryTextFontSpecs.resolve("poster", null).fontWeight).isEqualTo(800)
        assertThat(StoryTextFontSpecs.resolve("poster", "ultra").fontWeight).isEqualTo(800)
    }

    @Test
    fun `an unknown style resolves as bold`() {
        assertThat(StoryTextFontSpecs.resolve("future", null)).isEqualTo(StoryTextFontSpecs.resolve("bold", null))
    }

    @Test
    fun `weights decode by wire name`() {
        assertThat(StoryTextWeight.entries.map { it.wire }).containsExactly("thin", "normal", "semibold", "bold").inOrder()
        assertThat(StoryTextWeight.fromWire("bogus")).isNull()
    }
}
