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
}
