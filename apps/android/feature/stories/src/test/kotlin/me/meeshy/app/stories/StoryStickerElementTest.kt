package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for the pure on-canvas emoji-sticker model: normalised-position
 * clamping, pinch/rotate, drag translation, publishability, and the wire mapping.
 * No Android, no I/O — the geometry clamp is reused from [StoryTextElement] (the
 * single source of truth) so the deck reducer and the canvas stay glue.
 */
@RunWith(JUnit4::class)
class StoryStickerElementTest {

    @Test
    fun `a fresh sticker sits at the canvas centre at rest`() {
        val sticker = StoryStickerElement(id = "s1", emoji = "😀")
        assertThat(sticker.x).isEqualTo(0.5f)
        assertThat(sticker.y).isEqualTo(0.5f)
        assertThat(sticker.scale).isEqualTo(1f)
        assertThat(sticker.rotationDeg).isEqualTo(0f)
    }

    @Test
    fun `an empty or blank emoji is not publishable`() {
        assertThat(StoryStickerElement(id = "s1", emoji = "").isPublishable).isFalse()
        assertThat(StoryStickerElement(id = "s1", emoji = "   ").isPublishable).isFalse()
    }

    @Test
    fun `a non-blank emoji is publishable`() {
        assertThat(StoryStickerElement(id = "s1", emoji = "🎉").isPublishable).isTrue()
    }

    // --- normalised ---

    @Test
    fun `normalised clamps out-of-range coordinates into the canvas`() {
        val sticker = StoryStickerElement(id = "s1", emoji = "😀", x = -0.4f, y = 1.7f).normalised()
        assertThat(sticker.x).isEqualTo(0f)
        assertThat(sticker.y).isEqualTo(1f)
    }

    @Test
    fun `normalised keeps a large scale and wraps rotation`() {
        val sticker = StoryStickerElement(id = "s1", emoji = "😀", scale = 99f, rotationDeg = 540f).normalised()
        assertThat(sticker.scale).isEqualTo(99f)
        assertThat(sticker.rotationDeg).isEqualTo(180f)
    }

    @Test
    fun `normalised collapses non-finite scale and rotation to defaults`() {
        val sticker = StoryStickerElement(id = "s1", emoji = "😀", scale = Float.NaN, rotationDeg = Float.NaN).normalised()
        assertThat(sticker.scale).isEqualTo(1f)
        assertThat(sticker.rotationDeg).isEqualTo(0f)
    }

    @Test
    fun `normalised leaves a valid sticker untouched`() {
        val sticker = StoryStickerElement(id = "s1", emoji = "😀", x = 0.3f, y = 0.6f, scale = 1.5f, rotationDeg = 45f)
        assertThat(sticker.normalised()).isEqualTo(sticker)
    }

    // --- transformed ---

    @Test
    fun `transformed multiplies scale and adds rotation`() {
        val sticker = StoryStickerElement(id = "s1", emoji = "😀", scale = 1f, rotationDeg = 10f)
            .transformed(scaleBy = 2f, rotateByDeg = 30f)
        assertThat(sticker.scale).isEqualTo(2f)
        assertThat(sticker.rotationDeg).isEqualTo(40f)
    }

    @Test
    fun `transformed grows the scale without a ceiling`() {
        val sticker = StoryStickerElement(id = "s1", emoji = "😀", scale = 3f).transformed(scaleBy = 10f, rotateByDeg = 0f)
            .transformed(scaleBy = 10f, rotateByDeg = 0f)
        assertThat(sticker.scale).isWithin(1e-3f).of(300f)
    }

    @Test
    fun `transformed shrinks the sticker down to a 5 design-pixel side and no further`() {
        val sticker = StoryStickerElement(id = "s1", emoji = "😀", scale = 1f).transformed(scaleBy = 0.0001f, rotateByDeg = 0f)
        assertThat(StoryStickerElement.BASE_DESIGN_SIDE).isEqualTo(140.0)
        assertThat(sticker.scale).isWithin(1e-6f).of(5f / 140f)
        assertThat(sticker.scale * StoryStickerElement.BASE_DESIGN_SIDE.toFloat()).isWithin(1e-4f).of(5f)
    }

    @Test
    fun `transformed passes below the old 0,3 floor`() {
        val sticker = StoryStickerElement(id = "s1", emoji = "😀", scale = 1f).transformed(scaleBy = 0.1f, rotateByDeg = 0f)
        assertThat(sticker.scale).isWithin(1e-6f).of(0.1f)
    }

    @Test
    fun `transformed leaves the scale where it is on a non-positive factor`() {
        val sticker = StoryStickerElement(id = "s1", emoji = "😀", scale = 2f).transformed(scaleBy = -1f, rotateByDeg = 0f)
        assertThat(sticker.scale).isEqualTo(2f)
    }

    @Test
    fun `transformed wraps a rotation past half a turn`() {
        val sticker = StoryStickerElement(id = "s1", emoji = "😀", rotationDeg = 170f).transformed(scaleBy = 1f, rotateByDeg = 30f)
        assertThat(sticker.rotationDeg).isEqualTo(-160f)
    }

    @Test
    fun `transformed leaves position and emoji untouched`() {
        val sticker = StoryStickerElement(id = "s1", emoji = "🎉", x = 0.2f, y = 0.7f)
            .transformed(scaleBy = 2f, rotateByDeg = 45f)
        assertThat(sticker.x).isEqualTo(0.2f)
        assertThat(sticker.y).isEqualTo(0.7f)
        assertThat(sticker.emoji).isEqualTo("🎉")
        assertThat(sticker.id).isEqualTo("s1")
    }

    // --- nudged ---

    @Test
    fun `nudged translates the sticker and clamps both axes`() {
        val sticker = StoryStickerElement(id = "s1", emoji = "😀", x = 0.9f, y = 0.1f).nudged(dx = 0.5f, dy = -0.5f)
        assertThat(sticker.x).isEqualTo(1f)
        assertThat(sticker.y).isEqualTo(0f)
    }

    @Test
    fun `nudged within bounds moves freely`() {
        val sticker = StoryStickerElement(id = "s1", emoji = "😀", x = 0.4f, y = 0.4f).nudged(dx = 0.2f, dy = 0.1f)
        assertThat(sticker.x).isWithin(1e-6f).of(0.6f)
        assertThat(sticker.y).isWithin(1e-6f).of(0.5f)
    }

    // --- toSticker (wire) ---

    @Test
    fun `toSticker carries id emoji position scale and rotation`() {
        val wire = StoryStickerElement(id = "s1", emoji = "🎉", x = 0.25f, y = 0.75f, scale = 1.5f, rotationDeg = 30f).toSticker()
        assertThat(wire.id).isEqualTo("s1")
        assertThat(wire.emoji).isEqualTo("🎉")
        assertThat(wire.x).isWithin(1e-6).of(0.25)
        assertThat(wire.y).isWithin(1e-6).of(0.75)
        assertThat(wire.scale).isWithin(1e-6).of(1.5)
        assertThat(wire.rotation).isWithin(1e-6).of(30.0)
    }
}
