package me.meeshy.ui.sticker

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTouchInput
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.sticker.StickerPackItemSummary
import me.meeshy.sdk.model.sticker.StickerPackSummary
import me.meeshy.sdk.model.sticker.StickerSheetChoice
import me.meeshy.sdk.model.sticker.StickerUsageEntry
import me.meeshy.sdk.sticker.InMemoryStickerUsageStorage
import me.meeshy.sdk.sticker.StickerUsageStore
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StickerSheetRobolectricTest {

    @get:Rule
    val compose = createComposeRule()

    private val categories = listOf(
        StickerEmojiCategory("SMILEYS", "Faces", listOf("😀", "😂")),
        StickerEmojiCategory("ANIMALS", "Animals", listOf("🐱")),
    )

    private val packRenderer: @Composable (String) -> Unit = { slug -> Text("pack:$slug") }

    private val oneItem = listOf(StickerPackItemSummary(key = "a", kind = "static"))

    private fun capabilities(withPacks: Boolean = false) = StickerCapabilities(
        emojiCategories = categories,
        emojiSearch = { query -> if (query.contains("cat")) listOf("🐱") else emptyList() },
        installedPacks = if (withPacks) {
            listOf(
                StickerPackSummary(slug = "ecole", name = "École", installed = true, items = oneItem),
                StickerPackSummary(slug = "fruits", name = "Fruits", installed = true, items = oneItem),
            )
        } else {
            null
        },
        packContent = if (withPacks) packRenderer else null,
    )

    private fun show(
        capabilities: StickerCapabilities = capabilities(),
        usage: StickerUsageStore = StickerUsageStore(InMemoryStickerUsageStorage()),
        placed: MutableList<StickerSheetChoice> = mutableListOf(),
        dismissed: () -> Unit = {},
    ) {
        compose.setContent {
            MeeshyTheme {
                StickerSheet(
                    capabilities = capabilities,
                    usage = usage,
                    destination = { placed += it },
                    onDismiss = dismissed,
                )
            }
        }
    }

    @Test
    fun `l'onglet Favoris vide dit comment le remplir`() {
        show()
        compose.onNodeWithContentDescription("Favorites").performClick()
        compose.onNodeWithText("Long-press a decoration to pin it here.").assertIsDisplayed()
    }

    @Test
    fun `l'onglet Recents vide dit ce qui l'alimente`() {
        show()
        compose.onNodeWithContentDescription("Recent").performClick()
        compose.onNodeWithText("What you place will show up here.").assertIsDisplayed()
    }

    @Test
    fun `la recherche ignore casse et accents et menu a la famille`() {
        show(capabilities(withPacks = true))
        compose.onNode(hasSetTextAction()).performTextInput("ECOLE")
        assertThat(compose.onAllNodesWithText("École").fetchSemanticsNodes()).hasSize(2)
        assertThat(compose.onAllNodesWithText("Fruits").fetchSemanticsNodes()).hasSize(1)
    }

    @Test
    fun `une recherche sans resultat affiche l'etat vide`() {
        show()
        compose.onNode(hasSetTextAction()).performTextInput("zzzz")
        compose.onNodeWithText("No family matches.").assertIsDisplayed()
    }

    @Test
    fun `la recherche par mots-cles d'emoji reste servie`() {
        show()
        compose.onNode(hasSetTextAction()).performTextInput("cat")
        compose.onNodeWithContentDescription("Sticker 🐱").assertIsDisplayed()
    }

    @Test
    fun `taper un emoji le pose, le retient dans les recents et ferme la feuille`() {
        val placed = mutableListOf<StickerSheetChoice>()
        val usage = StickerUsageStore(InMemoryStickerUsageStorage())
        var dismissed = false
        show(usage = usage, placed = placed, dismissed = { dismissed = true })
        compose.onNodeWithContentDescription("Smileys").performClick()
        compose.onNodeWithContentDescription("Sticker 😂").performClick()
        assertThat(placed).containsExactly(StickerSheetChoice.Emoji("😂"))
        assertThat(usage.recents.value).containsExactly(StickerUsageEntry.emoji("😂"))
        assertThat(dismissed).isTrue()
    }

    @Test
    fun `l'appui long propose d'epingler puis de retirer des favoris`() {
        val usage = StickerUsageStore(InMemoryStickerUsageStorage())
        show(usage = usage)
        compose.onNodeWithContentDescription("Smileys").performClick()
        compose.onNodeWithContentDescription("Sticker 😀").performTouchInput { longClick() }
        compose.onNodeWithText("Pin to favorites").performClick()
        assertThat(usage.favorites.value).containsExactly(StickerUsageEntry.emoji("😀"))
        compose.onNodeWithContentDescription("Sticker 😀").performTouchInput { longClick() }
        compose.onNodeWithText("Remove from favorites").assertIsDisplayed()
    }

    @Test
    fun `sans pack ni boutique la barre ne montre que les onglets fixes`() {
        show()
        assertThat(compose.onAllNodesWithText("Shop").fetchSemanticsNodes()).isEmpty()
        assertThat(compose.onAllNodesWithText("Custom").fetchSemanticsNodes()).isEmpty()
        compose.onNodeWithContentDescription("Smileys").assertIsDisplayed()
    }
}
