package me.meeshy.sdk.model.packs

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.appearance.AppearancePackDomain
import me.meeshy.sdk.model.appearance.InstalledPackSummary
import org.junit.Test

/** `pack:installation-updated` : la charge suffit à tenir la vitrine et la liste des packs installés à jour. */
class PackInstallationUpdatedEventTest {

    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

    private fun event(installed: Boolean = true, owned: Boolean? = true, slug: String = "prestige", domain: String = "avatar-ring") =
        PackInstallationUpdatedEvent(domain = domain, slug = slug, installed = installed, owned = owned, at = "2026-10-29T10:00:00.000Z")

    @Test fun `the wire shape of the gateway is decoded, an old server omitting owned reads null`() {
        val full = json.decodeFromString<PackInstallationUpdatedEvent>(
            """{"domain":"avatar-ring","slug":"prestige","installed":true,"owned":true,"at":"2026-10-29T10:00:00.000Z"}""",
        )
        val old = json.decodeFromString<PackInstallationUpdatedEvent>("""{"domain":"sticker","slug":"x","installed":false,"at":"t"}""")

        assertThat(full).isEqualTo(event())
        assertThat(old.owned).isNull()
        assertThat(old.appearanceDomain).isNull()
        assertThat(full.appearanceDomain).isEqualTo(AppearancePackDomain.AVATAR_RING)
    }

    @Test fun `an installed pack unknown to the list joins it, a known one is rewritten in place`() {
        val list = listOf(InstalledPackSummary("essentiels", installed = true, owned = true, removable = false))

        val joined = list.applying(event())
        val removed = joined.applying(event(installed = false, owned = true))

        assertThat(joined.map { it.slug }).containsExactly("essentiels", "prestige").inOrder()
        assertThat(joined.last().isOwned).isTrue()
        assertThat(joined.last().installed).isTrue()
        assertThat(removed.map { it.slug }).containsExactly("essentiels", "prestige").inOrder()
        assertThat(removed.last().installed).isFalse()
        assertThat(removed.first()).isEqualTo(list.first())
    }

    @Test fun `an event without owned keeps the ownership already known`() {
        val list = listOf(InstalledPackSummary("prestige", installed = false, owned = true, price = 90))

        val applied = list.applying(event(installed = true, owned = null))

        assertThat(applied.single().isOwned).isTrue()
        assertThat(applied.single().price).isEqualTo(90)
    }

    @Test fun `the shop flips the pack installed and owned, and touches no other pack nor domain`() {
        val shop = PackShopResponse(
            domains = listOf(
                PackShopSection("avatar-ring", listOf(ShopPack("prestige", price = 90, owned = false), ShopPack("autre", price = 10, owned = false))),
                PackShopSection("banner", listOf(ShopPack("prestige", price = 90, owned = false))),
            ),
            balance = 340,
        )

        val applied = shop.applying(event())

        val ring = applied.packs(AppearancePackDomain.AVATAR_RING)
        assertThat(ring.first { it.slug == "prestige" }.let { it.installed to it.isOwned }).isEqualTo(true to true)
        assertThat(ring.first { it.slug == "autre" }).isEqualTo(shop.packs(AppearancePackDomain.AVATAR_RING).last())
        assertThat(applied.packs(AppearancePackDomain.BANNER)).isEqualTo(shop.packs(AppearancePackDomain.BANNER))
        assertThat(applied.balance).isEqualTo(340)
    }

    @Test fun `a pack the shop does not list leaves the shop untouched`() {
        val shop = PackShopResponse(listOf(PackShopSection("avatar-ring", listOf(ShopPack("autre")))))

        assertThat(shop.applying(event())).isEqualTo(shop)
    }
}
