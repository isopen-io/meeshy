package me.meeshy.app.settings

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.sdk.model.appearance.AppearanceCatalog
import me.meeshy.sdk.model.appearance.AppearancePackDomain
import me.meeshy.sdk.model.packs.ShopPack
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PackShopBrowseComposeTest {

    @get:Rule
    val compose = createComposeRule()

    private val catalog = AppearanceCatalog.decode(repositoryFile("sdk-core/src/main/assets/appearance-catalog.json").readText())
    private val rings = EmbeddedShopContents.of(catalog, AppearancePackDomain.AVATAR_RING, "contours-essentiels", "en") as ShopPackContents.Ready
    private val pack = ShopPack(slug = "contours-essentiels", name = "Essential rings", author = "Meeshy", installed = true)

    @Test fun `the detail shows its facts without a price for a free pack and opens the touched item`() {
        var opened = -1
        compose.setContent {
            MeeshyTheme {
                PackShopDetail(pack, "en", rings, ShopViewerMe(), busy = false, onClose = {}, onToggleInstall = {}, onBuy = {}, onOpenItem = { opened = it })
            }
        }

        compose.onNodeWithText("Items in this pack").assertExists()
        compose.onNodeWithText("by Meeshy").assertExists()
        compose.onNodeWithText("Meeshes", substring = true).assertDoesNotExist()
        compose.onNodeWithContentDescription("Show ${rings.items[1].name} full screen").performScrollTo().performClick()

        assertThat(opened).isEqualTo(1)
    }

    @Test fun `a paid pack shows its price on the detail`() {
        compose.setContent {
            MeeshyTheme {
                PackShopDetail(pack.copy(price = 40, owned = false, installed = false), "en", rings, ShopViewerMe(), false, {}, {}, {}, {})
            }
        }

        compose.onNodeWithText("40 Meeshes", substring = true).assertExists()
    }

    @Test fun `the viewer shows the position, offers to equip and closes on the cross`() {
        var closed = 0
        var equipped: ShopItem? = null
        compose.setContent {
            MeeshyTheme {
                PackShopViewer(
                    route = ShopBrowseRoute.Viewer(AppearancePackDomain.AVATAR_RING, pack.slug, 2),
                    pack = pack, packName = "Essential rings", contents = rings, others = emptyList(), me = ShopViewerMe(),
                    equipFailed = false, busy = false, onSettle = {}, onClose = { closed += 1 }, onEquip = { equipped = it },
                    onInstall = {}, onProposal = {},
                )
            }
        }
        compose.waitForIdle()

        compose.onNodeWithText("3 / ${rings.items.size}").assertExists()
        compose.onNodeWithText("Equip").performClick()
        compose.onNodeWithContentDescription("Close").performClick()

        assertThat(equipped?.key).isEqualTo(rings.items[2].key)
        assertThat(closed).isEqualTo(1)
    }

    @Test fun `a pack not on the device draws the download state instead of an empty screen`() {
        compose.setContent {
            MeeshyTheme {
                PackShopViewer(
                    route = ShopBrowseRoute.Viewer(AppearancePackDomain.WALLPAPER, "servi", 0),
                    pack = null, packName = "Servi", contents = ShopPackContents.DownloadRequired, others = emptyList(),
                    me = ShopViewerMe(), equipFailed = false, busy = false, onSettle = {}, onClose = {}, onEquip = {},
                    onInstall = {}, onProposal = {},
                )
            }
        }

        compose.onNodeWithText("Download required").assertExists()
    }

    private fun repositoryFile(relative: String): File {
        val candidates = generateSequence(File(".").absoluteFile) { it.parentFile }.take(8).flatMap {
            sequenceOf(File(it, relative), File(it, "apps/android/$relative"))
        }
        return checkNotNull(candidates.firstOrNull { it.exists() }) { "$relative introuvable depuis ${File(".").absolutePath}" }
    }
}
