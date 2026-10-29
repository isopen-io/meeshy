package me.meeshy.app.settings

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import me.meeshy.sdk.model.packs.ShopPack
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PackShopRowTest {

    @get:Rule
    val compose = createComposeRule()

    private fun show(pack: ShopPack) {
        compose.setContent { MeeshyTheme { PackRow(pack, "en", busy = false, focused = false, onBuy = {}) } }
        compose.waitForIdle()
    }

    @Test
    fun `a free pack says it is free instead of showing only a bag`() {
        show(ShopPack(slug = "base", name = "Essentials"))

        compose.onNodeWithText("Free").assertExists()
    }

    @Test
    fun `a paid pack is not labelled free and offers the purchase`() {
        show(ShopPack(slug = "prestige", name = "Prestige", price = 20, owned = false))

        compose.onNodeWithText("Free").assertDoesNotExist()
        compose.onNodeWithText("Buy · 20").assertExists()
    }

    @Test
    fun `a locked free pack is not labelled free`() {
        val locked = kotlinx.serialization.json.buildJsonObject { put("met", kotlinx.serialization.json.JsonPrimitive(false)) }
        show(ShopPack(slug = "gagne", name = "Gagné", requirementPreview = locked))

        compose.onNodeWithText("Free").assertDoesNotExist()
    }
}
