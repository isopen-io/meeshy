package me.meeshy.app.chat.export

import com.google.common.truth.Truth.assertThat
import java.util.Locale
import org.junit.Test

class CardScrollTest {

    private val measure: CardMeasure = { text, font -> text.length * font.size * 0.5 }

    private fun input(reply: String, aspect: CardAspect = CardAspect.STORY, unbounded: Boolean = false, backdrop: CardBackdrop? = null) = CardInput(
        quoted = null,
        reply = CardPart("Awa", reply),
        template = CardTemplates.defaultId,
        handle = "moi",
        aspect = aspect,
        unbounded = unbounded,
        backdrop = backdrop,
    )

    private val long = "une phrase qui revient encore ".repeat(160)

    @Test
    fun `the nine speeds go from half to three times, one being the standard`() {
        assertThat(CardScrollSpeed.entries.map { it.factor }).containsExactly(0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0).inOrder()
        assertThat(CardScrollSpeed.standard).isEqualTo(CardScrollSpeed.X1)
    }

    @Test
    fun `a speed reads with the decimal of the language`() {
        assertThat(CardScrollSpeed.X0_75.label(Locale.FRENCH)).isEqualTo("×0,75")
        assertThat(CardScrollSpeed.X0_75.label(Locale.ENGLISH)).isEqualTo("×0.75")
        assertThat(CardScrollSpeed.X2.label(Locale.ENGLISH)).isEqualTo("×2")
    }

    @Test
    fun `a card that fits its format has nothing to scroll`() {
        assertThat(CardScrollPlan.of(contentHeight = 1920.0, viewportHeight = 1920.0, speed = CardScrollSpeed.X1)).isNull()
    }

    @Test
    fun `the card holds still, slides at constant speed, then rests on its last line`() {
        val plan = CardScrollPlan.of(contentHeight = 1920.0 + 540.0, viewportHeight = 1920.0, speed = CardScrollSpeed.X1)!!
        assertThat(plan.scrollDuration).isWithin(1e-9).of(10.0)
        assertThat(plan.duration).isWithin(1e-9).of(CardScrollPlan.LEAD_IN + 10.0 + CardScrollPlan.LEAD_OUT)
        assertThat(plan.offset(0.0)).isEqualTo(0.0)
        assertThat(plan.offset(CardScrollPlan.LEAD_IN + 5.0)).isWithin(1e-9).of(270.0)
        assertThat(plan.offset(plan.duration)).isEqualTo(540.0)
        assertThat(plan.frameCount).isEqualTo(405)
    }

    @Test
    fun `twice the speed takes half the scrolling time, and a very long card is capped`() {
        val standard = CardScrollPlan.of(3000.0, 1920.0, CardScrollSpeed.X1)!!
        val fast = CardScrollPlan.of(3000.0, 1920.0, CardScrollSpeed.X2)!!
        assertThat(fast.scrollDuration).isWithin(1e-9).of(standard.scrollDuration / 2)
        val endless = CardScrollPlan.of(1_000_000.0, 1920.0, CardScrollSpeed.X0_5)!!
        assertThat(endless.duration).isWithin(1e-9).of(CardScrollPlan.MAX_DURATION)
    }

    @Test
    fun `an unbounded card keeps its text whole and its window is the format`() {
        val capped = CardLayoutEngine.layout(input(long), measure)
        val tall = CardLayoutEngine.layout(input(long, unbounded = true), measure)
        assertThat(capped.truncated).isTrue()
        assertThat(tall.truncated).isFalse()
        assertThat(tall.viewportHeight).isEqualTo(1920.0)
        assertThat(tall.height).isGreaterThan(1920.0)
        assertThat(capped.viewportHeight).isNull()
    }

    @Test
    fun `a frame paints only what its window shows`() {
        val tall = CardLayoutEngine.layout(input(long, unbounded = true), measure)
        val window = tall.opsBetween(0.0, 1920.0)
        assertThat(window.size).isLessThan(tall.ops.size)
        assertThat(window.filterIsInstance<CardOp.Text>().all { it.y - it.font.size * 1.3 <= 1920.0 }).isTrue()
    }

    @Test
    fun `a chosen backdrop lies under a veil of the palette and stays under the window`() {
        val media = CardMedia(CardBackdrop.MEDIA_ID, CardMediaKind.VIDEO, "content://photo")
        val tall = CardLayoutEngine.layout(input(long, unbounded = true, backdrop = CardBackdrop(media, veil = 0.4)), measure)
        val picture = tall.backdrop[0] as CardOp.Picture
        val veil = tall.backdrop[1] as CardOp.Panel
        assertThat(picture.media.kind).isEqualTo(CardMediaKind.IMAGE)
        assertThat(picture.height).isEqualTo(1920.0)
        assertThat(veil.color.alpha).isEqualTo(0.4)
    }

    @Test
    fun `the veil stays between clear and almost opaque`() {
        val media = CardMedia(CardBackdrop.MEDIA_ID, CardMediaKind.IMAGE, "content://photo")
        assertThat(CardBackdrop(media, 2.0).veil).isEqualTo(CardBackdrop.MAX_VEIL)
        assertThat(CardBackdrop(media, -1.0).veil).isEqualTo(0.0)
        assertThat(CardBackdrop(media, Double.NaN).veil).isEqualTo(CardBackdrop.DEFAULT_VEIL)
    }

    @Test
    fun `a border frames the window, not the whole scrolling card`() {
        val decorated = CardDecorator(input(long, unbounded = true).copy(decor = CardDecor(frame = CardDecor.Frame.BORDER)))
            .decorated(CardLayoutEngine.layout(input(long, unbounded = true), measure))
        val bottom = decorated.backdrop.filterIsInstance<CardOp.Bar>().maxOf { it.y + it.height }
        assertThat(bottom).isAtMost(1920.0)
    }
}
