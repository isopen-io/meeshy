package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryGroupCubeGeometryTest {
    private val width = 1000f

    @Test
    fun `a face at rest is flat, unshaded, unmoved and facing the viewer`() {
        val face = StoryGroupCubeGeometry.face(0f, width)
        assertThat(face.rotationYDegrees).isEqualTo(0f)
        assertThat(face.translationX).isWithin(1e-3f).of(0f)
        assertThat(face.scale).isWithin(1e-4f).of(1f)
        assertThat(face.shade).isEqualTo(0f)
        assertThat(face.isFacingViewer).isTrue()
    }

    @Test
    fun `the angle follows the finger at ninety degrees per width and never reaches the singular ninety`() {
        assertThat(StoryGroupCubeGeometry.face(-500f, width).rotationYDegrees).isWithin(1e-3f).of(-45f)
        assertThat(StoryGroupCubeGeometry.face(2000f, width).rotationYDegrees).isEqualTo(StoryCubeTransform.EDGE_DEGREES)
        assertThat(StoryGroupCubeGeometry.face(-width, width).rotationYDegrees).isEqualTo(-StoryCubeTransform.EDGE_DEGREES)
    }

    @Test
    fun `direction is reversible and mirrored`() {
        val left = StoryGroupCubeGeometry.face(-300f, width)
        val right = StoryGroupCubeGeometry.face(300f, width)
        assertThat(left.rotationYDegrees).isWithin(1e-4f).of(-right.rotationYDegrees)
        assertThat(left.translationX).isWithin(1e-3f).of(-right.translationX)
        assertThat(left.translationX).isLessThan(0f)
        assertThat(left.scale).isWithin(1e-5f).of(right.scale)
    }

    @Test
    fun `a face turning away darkens up to the maximum shade and recedes`() {
        val half = StoryGroupCubeGeometry.face(-500f, width)
        val edge = StoryGroupCubeGeometry.face(-width, width)
        assertThat(half.shade).isWithin(1e-3f).of(0.45f * 0.7071f)
        assertThat(edge.shade).isWithin(1e-2f).of(StoryGroupCubeGeometry.MAXIMUM_SHADE)
        assertThat(edge.scale).isLessThan(half.scale)
        assertThat(half.scale).isLessThan(1f)
    }

    @Test
    fun `a face past ninety degrees is a back face and is hidden`() {
        assertThat(StoryGroupCubeGeometry.face(-990f, width).isFacingViewer).isTrue()
        assertThat(StoryGroupCubeGeometry.face(-width, width).isFacingViewer).isFalse()
        assertThat(StoryGroupCubeGeometry.face(1500f, width).isFacingViewer).isFalse()
    }

    @Test
    fun `no matrix is ever singular whatever the offset`() {
        listOf(-5000f, -1000f, -999f, 0f, 1f, 999f, 1000f, 5000f).forEach { offset ->
            val face = StoryGroupCubeGeometry.face(offset, width)
            assertThat(face.scale).isGreaterThan(0f)
            assertThat(face.scale.isNaN()).isFalse()
            assertThat(face.translationX.isNaN()).isFalse()
        }
        assertThat(StoryGroupCubeGeometry.face(10f, 0f).scale).isGreaterThan(0f)
    }

    @Test
    fun `the neighbour waits one width away on the other side of the shared edge`() {
        assertThat(StoryGroupCubeGeometry.neighborOffset(-250f, width)).isEqualTo(750f)
        assertThat(StoryGroupCubeGeometry.neighborOffset(250f, width)).isEqualTo(-750f)
    }

    @Test
    fun `the neighbour hinges on the shared edge of the turning face`() {
        val current = StoryGroupCubeGeometry.face(-400f, width)
        val next = StoryGroupCubeGeometry.face(StoryGroupCubeGeometry.neighborOffset(-400f, width), width)
        assertThat(current.rotationYDegrees).isLessThan(0f)
        assertThat(next.rotationYDegrees).isGreaterThan(0f)
        assertThat(next.rotationYDegrees - current.rotationYDegrees).isWithin(1e-3f).of(90f)
        assertThat(next.isFacingViewer).isTrue()
    }

    @Test
    fun `the identity stays hidden on a micro drag, then rises linearly to full well before the commit`() {
        assertThat(StoryGroupCubeGeometry.identityOpacity(0.05f)).isEqualTo(0f)
        assertThat(StoryGroupCubeGeometry.identityOpacity(0.08f)).isEqualTo(0f)
        assertThat(StoryGroupCubeGeometry.identityOpacity(0.315f)).isWithin(1e-3f).of(0.5f)
        assertThat(StoryGroupCubeGeometry.identityOpacity(0.55f)).isEqualTo(1f)
        assertThat(StoryGroupCubeGeometry.identityOpacity(1f)).isEqualTo(1f)
    }

    @Test
    fun `the commit lands before the content swap`() {
        assertThat(StoryGroupCubeGeometry.COMMIT_MILLIS).isEqualTo(340)
        assertThat(StoryGroupCubeGeometry.SWAP_DELAY_MILLIS).isEqualTo(380)
        assertThat(StoryGroupCubeGeometry.revealProgress(-500f, width)).isWithin(1e-6f).of(0.5f)
        assertThat(StoryGroupCubeGeometry.revealProgress(-5000f, width)).isEqualTo(1f)
    }
}
