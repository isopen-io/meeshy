package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameReferralQrLayoutTest {

    private val link = "https://meeshy.me/signup/affiliate/AMANI7"

    private fun cells(square: GameReferralQrSquare): List<List<Boolean>> {
        val grid = List(square.size) { MutableList(square.size) { false } }
        square.runs.forEach { run ->
            val y = (run.y - square.origin) / square.module
            repeat(run.width / square.module) { step -> grid[y][(run.x - square.origin) / square.module + step] = true }
        }
        return grid
    }

    @Test
    fun `le carre redonne la matrice de l'encodeur`() {
        val square = GameReferralQrSquare.make(link, 181)!!
        assertThat(cells(square)).isEqualTo(GameQrCode.encode(link)!!.modules)
    }

    @Test
    fun `181 pixels - version 3, quatre pixels par module, centre`() {
        val square = GameReferralQrSquare.make(link, 181)!!
        assertThat(square.size).isEqualTo(29)
        assertThat(square.module).isEqualTo(4)
        assertThat(square.origin).isEqualTo(32)
    }

    @Test
    fun `pixels entiers, deux au moins, marge de silence de quatre modules`() {
        listOf(6, 12, 24, 32, 48, 64).forEach { length ->
            val square = GameReferralQrSquare.make("https://meeshy.me/r/" + "A".repeat(length), 181)!!
            assertThat(square.module).isAtLeast(2)
            assertThat(square.origin).isAtLeast(4 * square.module)
            assertThat(square.origin + square.size * square.module).isAtMost(square.side - 4 * square.module)
            assertThat(square.runs.all { (it.x - square.origin) % square.module == 0 && it.width % square.module == 0 && it.height == square.module }).isTrue()
        }
    }

    @Test
    fun `sans lien ou sans place lisible, pas de carre`() {
        assertThat(GameReferralQrSquare.make(null, 181)).isNull()
        assertThat(GameReferralQrSquare.make("", 181)).isNull()
        assertThat(GameReferralQrSquare.make(link, 0)).isNull()
        assertThat(GameReferralQrSquare.make(link, 40)).isNull()
        assertThat(GameReferralQrSquare.make("x".repeat(GameQrCode.byteCapacity(16)), 181)?.module).isEqualTo(2)
        assertThat(GameReferralQrSquare.make("x".repeat(GameQrCode.byteCapacity(16) + 1), 181)).isNull()
    }

    @Test
    fun `le carre est en fin de ligne sur le bandeau de 972 par 216`() {
        val metrics = GameReferralBannerMetrics.make(972.0, 216.0)
        assertThat(metrics.qr).isEqualTo(GameBannerRect(773.0, 18.0, 181.0, 181.0))
        assertThat(metrics.signature.maxX).isLessThan(metrics.title.x)
        assertThat(metrics.title.maxX).isLessThan(metrics.flame.x)
        assertThat(metrics.flame.maxX).isLessThan(metrics.qr.x)
        assertThat(metrics.flameLabel.maxX).isLessThan(metrics.qr.x)
    }

    @Test
    fun `en arabe le bandeau se retourne en entier`() {
        val ltr = GameReferralBannerMetrics.make(972.0, 216.0)
        val rtl = GameReferralBannerMetrics.make(972.0, 216.0, rightToLeft = true)
        assertThat(rtl.qr).isEqualTo(GameBannerRect(18.0, 18.0, 181.0, 181.0))
        assertThat(rtl.signature.maxX).isWithin(0.001).of(972.0 - ltr.signature.x)
        assertThat(rtl.qr.maxX).isLessThan(rtl.flame.x)
        assertThat(rtl.flame.maxX).isLessThan(rtl.title.x)
        assertThat(rtl.title.maxX).isLessThan(rtl.signature.x)
    }

    @Test
    fun `sans Flamme la phrase va jusqu'au carre`() {
        val with = GameReferralBannerMetrics.make(972.0, 216.0)
        val without = GameReferralBannerMetrics.make(972.0, 216.0, hasFlame = false)
        assertThat(without.title.width).isGreaterThan(with.title.width)
        assertThat(without.title.maxX).isLessThan(without.qr.x)
    }

    @Test
    fun `jamais de bandeau sans lien sauf l'apercu`() {
        assertThat(GameReferralBannerMetrics.slot(null, preview = false)).isEqualTo(GameReferralSlot.Hidden)
        assertThat(GameReferralBannerMetrics.slot("", preview = false)).isEqualTo(GameReferralSlot.Hidden)
        assertThat(GameReferralBannerMetrics.slot(null, preview = true)).isEqualTo(GameReferralSlot.Placeholder)
        assertThat(GameReferralBannerMetrics.slot(link, preview = true)).isEqualTo(GameReferralSlot.Qr)
        assertThat(GameReferralBannerMetrics.slot(link, preview = false)).isEqualTo(GameReferralSlot.Qr)
    }
}
