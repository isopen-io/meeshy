package me.meeshy.sdk.model.packs

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import org.junit.Test

class PackRowPresentationTest {

    private fun present(pack: ShopPack) = PackRowPresentation.of(pack)

    @Test fun `a paid pack not owned offers the purchase at its price`() {
        val row = present(ShopPack(slug = "a", price = 90, owned = false))

        assertThat(row.action).isEqualTo(PackRowAction.Buy(90))
        assertThat(row.showsOwned).isFalse()
        assertThat(row.showsFree).isFalse()
    }

    @Test fun `a paid pack I own shows the owned badge and installs`() {
        val row = present(ShopPack(slug = "a", price = 90, owned = true))

        assertThat(row.action).isEqualTo(PackRowAction.Install)
        assertThat(row.showsOwned).isTrue()
        assertThat(row.showsFree).isFalse()
    }

    @Test fun `an installed removable pack offers removal`() {
        assertThat(present(ShopPack(slug = "a", installed = true)).action).isEqualTo(PackRowAction.Remove)
    }

    @Test fun `an installed pack that cannot be removed has no button`() {
        assertThat(present(ShopPack(slug = "a", installed = true, removable = false)).action).isEqualTo(PackRowAction.None)
    }

    @Test fun `a free pack says so and installs`() {
        val row = present(ShopPack(slug = "a"))

        assertThat(row.showsFree).isTrue()
        assertThat(row.action).isEqualTo(PackRowAction.Install)
    }

    @Test fun `a locked pack is neither free nor buyable`() {
        val locked = buildJsonObject { put("met", JsonPrimitive(false)) }
        val row = present(ShopPack(slug = "a", requirementPreview = locked))

        assertThat(row.action).isEqualTo(PackRowAction.Locked)
        assertThat(row.showsFree).isFalse()
    }

    @Test fun `a locked paid pack is shown locked not buyable`() {
        val locked = buildJsonObject { put("met", JsonPrimitive(false)) }

        assertThat(present(ShopPack(slug = "a", price = 10, owned = false, requirementPreview = locked)).action)
            .isEqualTo(PackRowAction.Locked)
    }
    @Test fun `a pack to buy that the served balance does not cover says what is missing`() {
        val row = PackRowPresentation.of(ShopPack(slug = "a", price = 90, owned = false), balance = 82)

        assertThat(row.action).isEqualTo(PackRowAction.Buy(90))
        assertThat(row.shortfall).isEqualTo(8)
    }

    @Test fun `a pack the balance covers, exactly or more, says nothing missing`() {
        assertThat(PackRowPresentation.of(ShopPack(slug = "a", price = 90, owned = false), balance = 90).shortfall).isNull()
        assertThat(PackRowPresentation.of(ShopPack(slug = "a", price = 90, owned = false), balance = 400).shortfall).isNull()
    }

    @Test fun `an unknown balance, an owned, free or locked pack say nothing missing`() {
        val locked = buildJsonObject { put("met", JsonPrimitive(false)) }

        assertThat(PackRowPresentation.of(ShopPack(slug = "a", price = 90, owned = false), balance = null).shortfall).isNull()
        assertThat(PackRowPresentation.of(ShopPack(slug = "a", price = 90, owned = true), balance = 0).shortfall).isNull()
        assertThat(PackRowPresentation.of(ShopPack(slug = "a"), balance = 0).shortfall).isNull()
        assertThat(PackRowPresentation.of(ShopPack(slug = "a", price = 90, requirementPreview = locked), balance = 0).shortfall).isNull()
    }

    @Test fun `the shortfall law reads the spend preview of every spending gesture`() {
        assertThat(PackMeeshShortfall.missing(balance = 0, price = 1, owned = false)).isEqualTo(1)
        assertThat(PackMeeshShortfall.missing(balance = -5, price = 3, owned = false)).isEqualTo(3)
        assertThat(PackMeeshShortfall.missing(balance = 3, price = null, owned = false)).isNull()
    }
}
