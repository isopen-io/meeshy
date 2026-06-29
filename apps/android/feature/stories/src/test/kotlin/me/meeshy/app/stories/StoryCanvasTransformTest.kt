package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for the pure per-slide 9:16 canvas transform. The resolver owns
 * the pinch-zoom + drag-pan math — scale clamping to [1, MAX] and offset clamping to
 * the scaled-content overflow — so the canvas Composable stays declarative glue and
 * the transform persists as part of each slide. No Android, no I/O.
 */
@RunWith(JUnit4::class)
class StoryCanvasTransformTest {

    private val w = 1080f
    private val h = 1920f

    // --- identity / defaults ---

    @Test
    fun `default transform is the identity at rest`() {
        val t = StoryCanvasTransform()
        assertThat(t.scale).isEqualTo(StoryCanvasTransform.MIN_SCALE)
        assertThat(t.offsetX).isEqualTo(0f)
        assertThat(t.offsetY).isEqualTo(0f)
        assertThat(t.isIdentity).isTrue()
        assertThat(StoryCanvasTransform.IDENTITY).isEqualTo(t)
    }

    @Test
    fun `a panned or zoomed transform is not the identity`() {
        assertThat(StoryCanvasTransform(scale = 1f, offsetX = 5f).isIdentity).isFalse()
        assertThat(StoryCanvasTransform(scale = 2f).isIdentity).isFalse()
        assertThat(StoryCanvasTransform(offsetY = -3f).isIdentity).isFalse()
    }

    // --- scale clamping ---

    @Test
    fun `scale is clamped between min and max`() {
        assertThat(StoryCanvasTransform.clampScale(0.2f)).isEqualTo(StoryCanvasTransform.MIN_SCALE)
        assertThat(StoryCanvasTransform.clampScale(2.5f)).isEqualTo(2.5f)
        assertThat(StoryCanvasTransform.clampScale(9f)).isEqualTo(StoryCanvasTransform.MAX_SCALE)
    }

    @Test
    fun `apply clamps zoom-in to the max scale`() {
        val t = StoryCanvasTransform().apply(panX = 0f, panY = 0f, zoom = 100f, canvasWidth = w, canvasHeight = h)
        assertThat(t.scale).isEqualTo(StoryCanvasTransform.MAX_SCALE)
    }

    @Test
    fun `apply clamps zoom-out to the min scale`() {
        val zoomedIn = StoryCanvasTransform(scale = 3f)
        val t = zoomedIn.apply(panX = 0f, panY = 0f, zoom = 0.01f, canvasWidth = w, canvasHeight = h)
        assertThat(t.scale).isEqualTo(StoryCanvasTransform.MIN_SCALE)
    }

    @Test
    fun `apply multiplies the current scale by the gesture zoom factor`() {
        val t = StoryCanvasTransform(scale = 1.5f).apply(0f, 0f, zoom = 2f, canvasWidth = w, canvasHeight = h)
        assertThat(t.scale).isEqualTo(3f)
    }

    // --- offset clamping ---

    @Test
    fun `at rest scale there is no pan range`() {
        assertThat(StoryCanvasTransform.maxOffset(containerSize = w, scale = 1f)).isEqualTo(0f)
        val t = StoryCanvasTransform().apply(panX = 500f, panY = 500f, zoom = 1f, canvasWidth = w, canvasHeight = h)
        assertThat(t.offsetX).isEqualTo(0f)
        assertThat(t.offsetY).isEqualTo(0f)
    }

    @Test
    fun `zoomed in the pan range covers the overflowing half on each side`() {
        assertThat(StoryCanvasTransform.maxOffset(containerSize = 1000f, scale = 3f)).isEqualTo(1000f)
    }

    @Test
    fun `pan within the range is preserved on both axes`() {
        val t = StoryCanvasTransform(scale = 3f).apply(
            panX = 200f, panY = 300f, zoom = 1f, canvasWidth = 1000f, canvasHeight = 2000f,
        )
        assertThat(t.offsetX).isEqualTo(200f)
        assertThat(t.offsetY).isEqualTo(300f)
    }

    @Test
    fun `pan beyond the range is clamped symmetrically on both axes`() {
        val base = StoryCanvasTransform(scale = 3f)
        val far = base.apply(panX = 9999f, panY = 9999f, zoom = 1f, canvasWidth = 1000f, canvasHeight = 1000f)
        assertThat(far.offsetX).isEqualTo(1000f)
        assertThat(far.offsetY).isEqualTo(1000f)
        val near = base.apply(panX = -9999f, panY = -9999f, zoom = 1f, canvasWidth = 1000f, canvasHeight = 1000f)
        assertThat(near.offsetX).isEqualTo(-1000f)
        assertThat(near.offsetY).isEqualTo(-1000f)
    }

    @Test
    fun `pan accumulates across successive gestures`() {
        val t = StoryCanvasTransform(scale = 3f)
            .apply(panX = 100f, panY = 100f, zoom = 1f, canvasWidth = 1000f, canvasHeight = 1000f)
            .apply(panX = 150f, panY = 50f, zoom = 1f, canvasWidth = 1000f, canvasHeight = 1000f)
        assertThat(t.offsetX).isEqualTo(250f)
        assertThat(t.offsetY).isEqualTo(150f)
    }

    @Test
    fun `zooming back out re-clamps a now-out-of-range offset toward centre`() {
        // Panned to the edge at 3x (limit 1000), then zoomed down to 1.5x (limit 250).
        val edge = StoryCanvasTransform(scale = 3f, offsetX = 1000f, offsetY = 1000f)
        val t = edge.apply(panX = 0f, panY = 0f, zoom = 0.5f, canvasWidth = 1000f, canvasHeight = 1000f)
        assertThat(t.scale).isEqualTo(1.5f)
        assertThat(StoryCanvasTransform.maxOffset(1000f, 1.5f)).isEqualTo(250f)
        assertThat(t.offsetX).isEqualTo(250f)
        assertThat(t.offsetY).isEqualTo(250f)
    }

    // --- degenerate canvas ---

    @Test
    fun `a not-yet-measured canvas collapses the offset to centre without dividing by zero`() {
        val t = StoryCanvasTransform(scale = 3f).apply(
            panX = 500f, panY = 500f, zoom = 1f, canvasWidth = 0f, canvasHeight = 0f,
        )
        assertThat(t.offsetX).isEqualTo(0f)
        assertThat(t.offsetY).isEqualTo(0f)
    }

    // --- re-clamp on resize ---

    @Test
    fun `clampedTo snaps an offset back inside the bounds of the current scale`() {
        val t = StoryCanvasTransform(scale = 2f, offsetX = 5000f, offsetY = -5000f)
            .clampedTo(canvasWidth = 1000f, canvasHeight = 1000f)
        // limit at 2x = (1000*2 - 1000)/2 = 500
        assertThat(t.offsetX).isEqualTo(500f)
        assertThat(t.offsetY).isEqualTo(-500f)
        assertThat(t.scale).isEqualTo(2f)
    }

    @Test
    fun `clampedTo leaves an in-range offset untouched`() {
        val t = StoryCanvasTransform(scale = 2f, offsetX = 100f, offsetY = -100f)
            .clampedTo(canvasWidth = 1000f, canvasHeight = 1000f)
        assertThat(t.offsetX).isEqualTo(100f)
        assertThat(t.offsetY).isEqualTo(-100f)
    }
}
