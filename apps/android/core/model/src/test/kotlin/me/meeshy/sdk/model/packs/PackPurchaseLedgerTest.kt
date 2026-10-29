package me.meeshy.sdk.model.packs

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.appearance.AppearancePackDomain
import org.junit.Test

class PackPurchaseLedgerTest {

    private val wallpaper = AppearancePackDomain.WALLPAPER
    private val paid = ShopPack(slug = "animes", price = 90, owned = false)

    private fun begin(ledger: PackPurchaseLedger = PackPurchaseLedger(), pack: ShopPack? = paid, id: String = "r1") =
        ledger.begin(wallpaper, pack) { id }

    @Test
    fun `beginning a purchase touches neither the pack nor the balance, it only marks the gesture in flight`() {
        val begun = begin()!!

        assertThat(begun.requestId).isEqualTo("r1")
        assertThat(begun.ledger.pending).containsExactly("wallpaper.animes")
        assertThat(begun.ledger.pendingIn(wallpaper)).containsExactly("animes")
        assertThat(begun.ledger.pendingIn(AppearancePackDomain.BANNER)).isEmpty()
        assertThat(paid.isOwned).isFalse()
    }

    @Test
    fun `an unknown, free, owned or locked pack starts nothing`() {
        assertThat(begin(pack = null)).isNull()
        assertThat(begin(pack = ShopPack(slug = "free"))).isNull()
        assertThat(begin(pack = paid.copy(owned = true))).isNull()
        assertThat(begin(pack = paid.copy(requirementPreview = kotlinx.serialization.json.Json.parseToJsonElement("""{"met":false}""")))).isNull()
    }

    @Test
    fun `a second touch while the gesture is in flight is ignored`() {
        val begun = begin()!!

        assertThat(begin(begun.ledger)).isNull()
    }

    @Test
    fun `a transient failure keeps the intention id so the retry cannot charge twice`() {
        val begun = begin()!!
        val failed = begun.ledger.refused(wallpaper, "animes", PackPurchaseRefusal.of(httpStatus = null, code = null))

        assertThat(failed.pending).isEmpty()
        assertThat(failed.failure).isEqualTo(PackShopFailure.GENERIC)
        assertThat(begin(failed, id = "other")!!.requestId).isEqualTo("r1")
    }

    @Test
    fun `a server error is transient and keeps the intention id`() {
        val refusal = PackPurchaseRefusal.of(httpStatus = 503, code = null)

        assertThat(refusal.definitive).isFalse()
        assertThat(PackPurchaseRefusal.of(408, null).definitive).isFalse()
        assertThat(PackPurchaseRefusal.of(429, null).definitive).isFalse()
    }

    @Test
    fun `a definitive refusal closes the intention and a new gesture gets a new id`() {
        val begun = begin()!!
        val refusal = PackPurchaseRefusal.of(httpStatus = 409, code = "INSUFFICIENT_MEESHES")
        val refused = begun.ledger.refused(wallpaper, "animes", refusal)

        assertThat(refusal).isEqualTo(PackPurchaseRefusal(PackShopFailure.INSUFFICIENT_MEESHES, definitive = true))
        assertThat(refused.failure).isEqualTo(PackShopFailure.INSUFFICIENT_MEESHES)
        assertThat(begin(refused, id = "r2")!!.requestId).isEqualTo("r2")
    }

    @Test
    fun `a settled purchase clears the gesture and its id`() {
        val settled = begin()!!.ledger.settled(wallpaper, "animes")

        assertThat(settled).isEqualTo(PackPurchaseLedger())
    }

    @Test
    fun `a new gesture clears the previous failure and dismissing clears it`() {
        val refused = begin()!!.ledger.refused(wallpaper, "animes", PackPurchaseRefusal.of(409, "PACK_ALREADY_OWNED"))

        assertThat(refused.dismissFailure().failure).isNull()
        assertThat(begin(refused, id = "r2")!!.ledger.failure).isNull()
    }

    @Test
    fun `two packs of different domains with the same slug are two gestures`() {
        val first = begin()!!
        val second = first.ledger.begin(AppearancePackDomain.BANNER, paid) { "r2" }!!

        assertThat(second.ledger.pending).containsExactly("wallpaper.animes", "banner.animes")
    }
}
