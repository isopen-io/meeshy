package me.meeshy.sdk.model.pack

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.appearance.AppearancePackDomain
import me.meeshy.sdk.model.packs.PackPurchaseRefusal
import me.meeshy.sdk.model.packs.PackPurchaseResponse
import me.meeshy.sdk.model.packs.PackShopFailure
import me.meeshy.sdk.model.packs.PackShopResponse
import me.meeshy.sdk.model.packs.PackShopSection
import me.meeshy.sdk.model.packs.ShopPack
import org.junit.Test

class PackShopStateTest {

    private val wallpaper = AppearancePackDomain.WALLPAPER

    private fun shop(balance: Int? = 340) = PackShopResponse(
        domains = listOf(
            PackShopSection(
                "wallpaper",
                listOf(ShopPack(slug = "animes", price = 90, owned = false), ShopPack(slug = "nuit", price = 40, owned = false)),
            ),
        ),
        balance = balance,
    )

    private fun loaded() = PackShopState().loaded(shop())

    private fun started(state: PackShopState, slug: String): PackPurchaseStart.Started =
        state.beginPurchase(wallpaper, slug) { "req-$slug" } as PackPurchaseStart.Started

    @Test fun `never loaded shows placeholders and no failure`() {
        val state = PackShopState()

        assertThat(state.shop).isNull()
        assertThat(state.showsPlaceholders).isTrue()
        assertThat(state.showsLoadFailure).isFalse()
    }

    @Test fun `loading keeps placeholders only while nothing is known`() {
        assertThat(PackShopState().startLoading().loading).isTrue()
        assertThat(PackShopState().startLoading().showsPlaceholders).isTrue()
        assertThat(loaded().startLoading().showsPlaceholders).isFalse()
    }

    @Test fun `a failed read on a cold cache shows the failure`() {
        val state = PackShopState().startLoading().loadFailed()

        assertThat(state.showsLoadFailure).isTrue()
        assertThat(state.showsPlaceholders).isFalse()
        assertThat(state.loading).isFalse()
    }

    @Test fun `a failed read never erases a known shop`() {
        val state = loaded().loadFailed()

        assertThat(state.shop).isEqualTo(shop())
        assertThat(state.showsLoadFailure).isFalse()
    }

    @Test fun `a served shop replaces the loading and failure flags`() {
        val state = PackShopState().startLoading().loadFailed().loaded(shop())

        assertThat(state.loading).isFalse()
        assertThat(state.loadFailed).isFalse()
        assertThat(state.balance).isEqualTo(340)
    }

    @Test fun `a purchase marks only its own pack in flight`() {
        val begun = started(loaded(), "animes")

        assertThat(begun.requestId).isEqualTo("req-animes")
        assertThat(begun.state.isPending(wallpaper, "animes")).isTrue()
        assertThat(begun.state.isPending(wallpaper, "nuit")).isFalse()
        assertThat(begun.state.shop).isEqualTo(shop())
    }

    @Test fun `another pack can be bought while the first is in flight`() {
        val first = started(loaded(), "animes").state

        val second = started(first, "nuit")

        assertThat(second.state.ledger.pending).hasSize(2)
    }

    @Test fun `a second touch on a pack in flight is ignored`() {
        val first = started(loaded(), "animes").state

        assertThat(first.beginPurchase(wallpaper, "animes") { "other" }).isEqualTo(PackPurchaseStart.Ignored)
    }

    @Test fun `a confirmed purchase takes the served pack and balance`() {
        val begun = started(loaded(), "animes").state
        val bought = ShopPack(slug = "animes", price = 90, owned = true, installed = true)

        val settled = begun.purchaseSettled(wallpaper, "animes", PackPurchaseResponse(bought, balance = 250))

        assertThat(settled.balance).isEqualTo(250)
        assertThat(settled.packs(wallpaper)!!.first { it.slug == "animes" }.isOwned).isTrue()
        assertThat(settled.isPending(wallpaper, "animes")).isFalse()
    }

    @Test fun `insufficient meeshes tells so and changes no ownership`() {
        val begun = started(loaded(), "animes").state

        val refused = begun.purchaseRefused(wallpaper, "animes", PackPurchaseRefusal.of(409, "INSUFFICIENT_MEESHES"))

        assertThat(refused.failure).isEqualTo(PackShopFailure.INSUFFICIENT_MEESHES)
        assertThat(refused.shop).isEqualTo(shop())
        assertThat(refused.isPending(wallpaper, "animes")).isFalse()
        assertThat(refused.needsReload).isFalse()
    }

    @Test fun `a definitive refusal closes the intent and a transient one keeps it for the retry`() {
        val begun = started(loaded(), "animes").state

        val transient = begun.purchaseRefused(wallpaper, "animes", PackPurchaseRefusal.of(503, null))
        val retry = started(transient, "animes")
        val definitive = begun.purchaseRefused(wallpaper, "animes", PackPurchaseRefusal.of(404, null))

        assertThat(retry.requestId).isEqualTo("req-animes")
        assertThat(definitive.ledger.requestIds).isEmpty()
    }

    @Test fun `a forbidden answer arms a reload that the next served shop satisfies`() {
        val begun = started(loaded(), "animes").state

        val refused = begun.purchaseRefused(wallpaper, "animes", PackPurchaseRefusal.of(403, "PACK_NOT_OWNED"))
        val reloaded = refused.loaded(shop(balance = 100))

        assertThat(refused.needsReload).isTrue()
        assertThat(reloaded.needsReload).isFalse()
    }

    @Test fun `offline a purchase is refused with an offline failure and consumes nothing`() {
        val offline = loaded().connectivity(isOnline = false)

        val start = offline.beginPurchase(wallpaper, "animes") { error("no intent id offline") }

        val refused = (start as PackPurchaseStart.Offline).state
        assertThat(refused.failure).isEqualTo(PackShopFailure.OFFLINE)
        assertThat(refused.ledger.pending).isEmpty()
        assertThat(refused.shop).isEqualTo(shop())
    }

    @Test fun `offline the known shop is still served`() {
        val offline = loaded().connectivity(isOnline = false)

        assertThat(offline.packs(wallpaper)).hasSize(2)
        assertThat(offline.showsPlaceholders).isFalse()
    }

    @Test fun `a network failure reads as an offline refusal that stays replayable`() {
        val refusal = PackPurchaseRefusal.of(httpStatus = null, code = "NETWORK")

        assertThat(refusal.failure).isEqualTo(PackShopFailure.OFFLINE)
        assertThat(refusal.definitive).isFalse()
    }
}
