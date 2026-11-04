package me.meeshy.sdk.model.game.photo

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.GameReferralBannerMetrics
import org.junit.Test

class GamePhotoLayoutTest {

    @Test
    fun `without a link the card has no banner, no QR and the signature at the foot`() {
        val story = GamePhotoLayout.layout(PhotoFormat.Story)

        assertThat(story.banner).isNull()
        assertThat(story.qr).isNull()
        assertThat(story.mee.y).isWithin(0.01f).of(1585.2f)
    }

    @Test
    fun `the story banner takes 20 percent of the width at the foot and lifts the birds above it`() {
        val story = GamePhotoLayout.layout(PhotoFormat.Story, referral = true)

        val banner = story.banner!!
        assertRect(banner, 54f, 1920f - 54f - 216f, 972f, 216f)
        assertThat(story.mee.y + story.mee.height).isWithin(0.01f).of(banner.y - 27f)
    }

    @Test
    fun `the square banner raises the text and shrinks the birds`() {
        val square = GamePhotoLayout.layout(PhotoFormat.Square, referral = true)

        assertThat(square.kicker.y).isWithin(0.01f).of(453.6f)
        assertThat(square.title.y).isWithin(0.01f).of(540f)
        assertThat(square.date.y).isWithin(0.01f).of(604.8f)
        assertThat(square.mee.width).isWithin(0.01f).of(162f)
        assertRect(square.banner!!, 54f, 1080f - 54f - 216f, 972f, 216f)
    }

    @Test
    fun `the QR sits at the end of the banner row, on the right in LTR and on the left in RTL`() {
        val ltr = GamePhotoLayout.layout(PhotoFormat.Story, referral = true, rightToLeft = false)
        val rtl = GamePhotoLayout.layout(PhotoFormat.Story, referral = true, rightToLeft = true)

        val expected = GameReferralBannerMetrics.make(972.0, 216.0, rightToLeft = false).qr
        assertThat(ltr.qr!!.x).isWithin(0.01f).of(54f + expected.x.toFloat())
        assertThat(ltr.qr!!.y).isWithin(0.01f).of(ltr.banner!!.y + expected.y.toFloat())
        assertThat(ltr.qr!!.width).isEqualTo(181f)
        assertThat(rtl.qr!!.x).isLessThan(ltr.qr!!.x)
        assertThat(rtl.qr!!.x).isWithin(0.01f).of(54f + GameReferralBannerMetrics.make(972.0, 216.0, rightToLeft = true).qr.x.toFloat())
    }

    @Test
    fun `the rest of the card does not move in RTL`() {
        val ltr = GamePhotoLayout.layout(PhotoFormat.Square, referral = true, rightToLeft = false)
        val rtl = GamePhotoLayout.layout(PhotoFormat.Square, referral = true, rightToLeft = true)

        assertThat(rtl.copy(qr = null)).isEqualTo(ltr.copy(qr = null))
    }

    @Test
    fun `the author plate sits under the date in 9 16 at the cartouche proportion`() {
        val story = GamePhotoLayout.layout(PhotoFormat.Story)

        assertThat(story.author.width).isWithin(0.01f).of(756f)
        assertThat(story.author.height).isWithin(0.01f).of(210f)
        assertThat(story.author.x).isWithin(0.01f).of(162f)
        assertThat(story.author.y).isWithin(0.01f).of(960f + 54f)
    }

    @Test
    fun `the square plate rides the bird row with a banner and sits above the signature without one`() {
        val plain = GamePhotoLayout.layout(PhotoFormat.Square)
        val banner = GamePhotoLayout.layout(PhotoFormat.Square, referral = true)

        assertThat(plain.author.width).isWithin(0.01f).of(475.2f)
        assertThat(plain.author.y + plain.author.height).isWithin(0.01f).of(1080f - 54f - 75.6f - 10.8f)
        assertThat(banner.author.y + banner.author.height / 2).isWithin(0.01f).of(banner.mee.y + banner.mee.height / 2)
    }

    @Test
    fun `an interface language reads right to left only for the right to left scripts`() {
        assertThat(GamePhotoLayout.readsRightToLeft("ar")).isTrue()
        assertThat(GamePhotoLayout.readsRightToLeft("he")).isTrue()
        assertThat(GamePhotoLayout.readsRightToLeft("fa-IR")).isTrue()
        assertThat(GamePhotoLayout.readsRightToLeft("fr")).isFalse()
        assertThat(GamePhotoLayout.readsRightToLeft(null)).isFalse()
    }

    private fun assertRect(rect: PhotoRect, x: Float, y: Float, width: Float, height: Float) {
        assertThat(rect.x).isWithin(0.01f).of(x)
        assertThat(rect.y).isWithin(0.01f).of(y)
        assertThat(rect.width).isWithin(0.01f).of(width)
        assertThat(rect.height).isWithin(0.01f).of(height)
    }
}
