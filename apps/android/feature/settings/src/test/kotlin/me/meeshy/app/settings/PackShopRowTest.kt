package me.meeshy.app.settings

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
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

    private fun showToggling(pack: ShopPack, busy: Boolean = false, onToggle: () -> Unit = {}) {
        compose.setContent {
            MeeshyTheme { PackRow(pack, "en", busy = busy, focused = false, onBuy = {}, onToggleInstall = onToggle) }
        }
        compose.waitForIdle()
    }

    @Test
    fun `an owned pack not installed offers Install and the touch asks for it`() {
        var asked = 0
        showToggling(ShopPack(slug = "base", name = "Essentials", owned = true)) { asked += 1 }

        compose.onNodeWithText("Install").performClick()

        assertThat(asked).isEqualTo(1)
    }

    @Test
    fun `an installed removable pack offers Remove`() {
        showToggling(ShopPack(slug = "base", name = "Essentials", owned = true, installed = true, removable = true))

        compose.onNodeWithText("Remove").assertExists()
        compose.onNodeWithText("Install").assertDoesNotExist()
    }

    @Test
    fun `an installed pack the server says is not removable offers no gesture`() {
        showToggling(ShopPack(slug = "base", name = "Essentials", owned = true, installed = true, removable = false))

        compose.onNodeWithText("Remove").assertDoesNotExist()
        compose.onNodeWithText("Install").assertDoesNotExist()
    }

    @Test
    fun `a pack to buy, or still locked, offers no install`() {
        showToggling(ShopPack(slug = "prestige", name = "Prestige", price = 20, owned = false))
        compose.onNodeWithText("Install").assertDoesNotExist()
        compose.onNodeWithText("Buy · 20").assertExists()
    }

    @Test
    fun `a locked pack not installed says locked and offers no install`() {
        val locked = kotlinx.serialization.json.buildJsonObject { put("met", kotlinx.serialization.json.JsonPrimitive(false)) }
        showToggling(ShopPack(slug = "gagne", name = "Gagné", requirementPreview = locked))

        compose.onNodeWithText("Locked").assertExists()
        compose.onNodeWithText("Install").assertDoesNotExist()
    }

    @Test
    fun `the install gesture is read by its action and the pack name`() {
        showToggling(ShopPack(slug = "base", name = "Essentials", owned = true))

        compose.onNodeWithContentDescription("Install Essentials").assertExists()
    }

    @Test
    fun `a busy install cannot be touched twice`() {
        var asked = 0
        showToggling(ShopPack(slug = "base", name = "Essentials", owned = true), busy = true) { asked += 1 }

        compose.onNodeWithText("Install").performClick()

        assertThat(asked).isEqualTo(0)
    }

    @Test
    fun `a pack with a served cover still renders its row and a pack without keeps the generic tile`() {
        show(ShopPack(slug = "base", name = "Essentials", coverUrl = "/api/v1/pack-assets/aaaaaaaaaaaaaaaa.webp"))
        compose.onNodeWithText("Essentials").assertExists()
    }
}
