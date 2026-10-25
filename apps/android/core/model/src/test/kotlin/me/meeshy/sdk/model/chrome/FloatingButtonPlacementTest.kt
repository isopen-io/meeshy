package me.meeshy.sdk.model.chrome

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.layout.EdgeInsetsDp
import me.meeshy.sdk.model.layout.PointDp
import org.junit.Test

/**
 * Miroir des tests de `FloatingButtonGeometry` (FloatingButtonPlacement.swift) : le disque est
 * toujours contre un bord, sa hauteur bornee par la zone sure REELLE, deux disques du meme cote
 * gardent leur ecart, et seul un vrai glisser ecrit une position.
 */
class FloatingButtonPlacementTest {

    private fun phone(
        width: Float = 400f,
        height: Float = 800f,
        insets: EdgeInsetsDp = EdgeInsetsDp(top = 24f, bottom = 48f),
    ) = FloatingButtonGeometry(screenWidth = width, screenHeight = height, safeInsets = insets)

    @Test
    fun `the disc always sits against the left or right edge, padded from the safe zone`() {
        val geometry = phone(insets = EdgeInsetsDp(left = 10f, top = 24f, right = 30f, bottom = 48f))
        assertThat(geometry.x(FloatingButtonSide.LEADING)).isEqualTo(10f + 20f + 26f)
        assertThat(geometry.x(FloatingButtonSide.TRAILING)).isEqualTo(400f - 30f - 20f - 26f)
    }

    @Test
    fun `the height range is the real safe zone minus the vertical margin`() {
        val geometry = phone()
        assertThat(geometry.minY).isEqualTo(24f + 8f + 26f)
        assertThat(geometry.maxY).isEqualTo(800f - 48f - 8f - 26f)
    }

    @Test
    fun `a placement is clamped under the notch and above the gesture bar`() {
        val geometry = phone()
        val top = geometry.center(FloatingButtonPlacement.of(FloatingButtonSide.LEADING, 0f))
        val bottom = geometry.center(FloatingButtonPlacement.of(FloatingButtonSide.TRAILING, 1f))
        assertThat(top).isEqualTo(PointDp(46f, 58f))
        assertThat(bottom).isEqualTo(PointDp(354f, 718f))
    }

    @Test
    fun `a free height inside the range is kept as chosen`() {
        val center = phone().center(FloatingButtonPlacement.of(FloatingButtonSide.LEADING, 0.5f))
        assertThat(center.y).isEqualTo(400f)
    }

    @Test
    fun `defaults put the feed top left and the menu top right, under the story band`() {
        val layout = phone().layout(feedStorage = null, menuStorage = null)
        val underStories = FloatingButtonSafeZone.TOP + 26f
        assertThat(layout.feed).isEqualTo(PointDp(46f, underStories))
        assertThat(layout.menu).isEqualTo(PointDp(354f, underStories))
        assertThat(FloatingButtonSafeZone.TOP).isEqualTo(246f)
    }

    @Test
    fun `an unreadable value falls back to the default`() {
        val geometry = phone()
        val fallback = geometry.centerForStorage(FloatingButtonGeometry.DEFAULT_FEED_STORAGE, "")
        assertThat(geometry.centerForStorage("garbage", FloatingButtonGeometry.DEFAULT_FEED_STORAGE)).isEqualTo(fallback)
        assertThat(geometry.centerForStorage("v9,L,0.5", FloatingButtonGeometry.DEFAULT_FEED_STORAGE)).isEqualTo(fallback)
        assertThat(geometry.centerForStorage("NaN,0.5", FloatingButtonGeometry.DEFAULT_FEED_STORAGE)).isEqualTo(fallback)
    }

    @Test
    fun `the storage value is side plus screen fraction, locale independent`() {
        assertThat(FloatingButtonPlacement.of(FloatingButtonSide.LEADING, 0.5f).storageValue).isEqualTo("v3,L,0.500000")
        assertThat(FloatingButtonPlacement.of(FloatingButtonSide.TRAILING, 2f).storageValue).isEqualTo("v3,R,1.000000")
    }

    @Test
    fun `a v3 value is read back to the same place`() {
        val geometry = phone()
        val placement = FloatingButtonPlacement.of(FloatingButtonSide.TRAILING, 0.4f)
        assertThat(geometry.centerForStorage(placement.storageValue, FloatingButtonGeometry.DEFAULT_MENU_STORAGE))
            .isEqualTo(geometry.center(placement))
    }

    @Test
    fun `a v2 value is a fraction of the allowed range`() {
        val geometry = phone()
        val center = geometry.centerForStorage("v2,R,0.5", FloatingButtonGeometry.DEFAULT_MENU_STORAGE)
        assertThat(center).isEqualTo(PointDp(354f, (58f + 718f) / 2f))
    }

    @Test
    fun `two discs on the same side keep the minimal gap - the menu moves below the feed`() {
        val geometry = phone()
        val feed = PointDp(46f, 272f)
        assertThat(geometry.resolved(PointDp(46f, 280f), awayFrom = feed)).isEqualTo(PointDp(46f, 272f + 64f))
        assertThat(geometry.resolved(PointDp(46f, 260f), awayFrom = feed)).isEqualTo(PointDp(46f, 272f - 64f))
    }

    @Test
    fun `a disc that cannot fit below its neighbour goes above it`() {
        val geometry = phone()
        val feedAtBottom = PointDp(46f, 718f)
        assertThat(geometry.resolved(PointDp(46f, 718f), awayFrom = feedAtBottom)).isEqualTo(PointDp(46f, 654f))
    }

    @Test
    fun `when neither above nor below fits, the disc changes side`() {
        val geometry = phone(height = 150f, insets = EdgeInsetsDp.Zero)
        val feed = PointDp(46f, 75f)
        assertThat(geometry.resolved(PointDp(46f, 75f), awayFrom = feed)).isEqualTo(PointDp(354f, 75f))
    }

    @Test
    fun `discs on opposite sides never push each other`() {
        val geometry = phone()
        assertThat(geometry.resolved(PointDp(354f, 272f), awayFrom = PointDp(46f, 272f))).isEqualTo(PointDp(354f, 272f))
    }

    @Test
    fun `the layout pushes the menu off the feed, never the feed`() {
        val geometry = phone()
        val feed = FloatingButtonPlacement.of(FloatingButtonSide.LEADING, 0.5f).storageValue
        val layout = geometry.layout(feedStorage = feed, menuStorage = feed)
        assertThat(layout.feed).isEqualTo(PointDp(46f, 400f))
        assertThat(layout.menu).isEqualTo(PointDp(46f, 464f))
    }

    @Test
    fun `a tap - even a trembling one - writes nothing`() {
        val geometry = phone()
        val start = PointDp(46f, 272f)
        assertThat(geometry.storageAfterDrag(start, 5f, 5f, avoiding = PointDp(354f, 272f))).isNull()
    }

    @Test
    fun `a real drag writes the nearest edge and the dropped height`() {
        val geometry = phone()
        val stored = geometry.storageAfterDrag(PointDp(46f, 272f), 300f, 100f, avoiding = PointDp(354f, 272f))
        assertThat(stored).isEqualTo("v3,R,0.465000")
    }

    @Test
    fun `a drop onto the other disc lands just beside it`() {
        val geometry = phone()
        val stored = geometry.storageAfterDrag(PointDp(46f, 272f), 300f, 10f, avoiding = PointDp(354f, 272f))
        assertThat(stored).isEqualTo(FloatingButtonPlacement.of(FloatingButtonSide.TRAILING, 336f / 800f).storageValue)
    }

    @Test
    fun `the ladder opens downward when it fits, upward otherwise`() {
        val geometry = phone()
        val extent = 6 * (46f + 12f)
        assertThat(geometry.menuOpensDownward(PointDp(354f, 272f), extent)).isTrue()
        assertThat(geometry.menuOpensDownward(PointDp(354f, 700f), extent)).isFalse()
    }

    @Test
    fun `nothing is placed on an unmeasured screen`() {
        assertThat(FloatingButtonGeometry(0f, 0f, EdgeInsetsDp.Zero).isMeasured).isFalse()
        assertThat(phone().isMeasured).isTrue()
    }
}
