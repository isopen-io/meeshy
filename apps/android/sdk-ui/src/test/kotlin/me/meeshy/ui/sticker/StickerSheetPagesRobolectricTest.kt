package me.meeshy.ui.sticker

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.hasScrollToIndexAction
import androidx.compose.ui.test.performScrollTo
import com.google.common.truth.Truth.assertThat
import java.time.Instant
import me.meeshy.sdk.model.sticker.MeeStickerCatalog
import me.meeshy.sdk.model.sticker.StickerPackItemSummary
import me.meeshy.sdk.model.sticker.StickerPackState
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
@Config(sdk = [34], qualifiers = "en")
class StickerSheetPagesRobolectricTest {

    @get:Rule
    val compose = createComposeRule()

    private val noon = Instant.parse("2026-10-30T12:05:00Z")

    private fun show(
        library: StickerLibraryShelf? = null,
        shopToggles: MutableList<String> = mutableListOf(),
        placed: MutableList<StickerSheetChoice> = mutableListOf(),
        usage: StickerUsageStore = StickerUsageStore(InMemoryStickerUsageStorage()),
        installed: List<StickerPackSummary>? = null,
        onDismiss: () -> Unit = {},
    ) {
        val capabilities = StickerCapabilities(
            emojiCategories = listOf(StickerEmojiCategory("SMILEYS", "Faces", listOf("😀"))),
            installedPacks = installed,
            hasMee = true,
            packContent = { slug ->
                val cast = MeeStickerCatalog.cast(slug)
                if (cast != null) MeeStickerPackPage(cast)
                else installed?.firstOrNull { it.slug == slug }?.let { StickerPackItemsPage(it, imageModel = { url -> url }) }
            },
            custom = { StickerCustomPage(library = library, openedAt = noon) },
            shop = {
                StickerPackShopPage(
                    packs = listOf(
                        StickerPackSummary(slug = "mee", name = "Mee", installed = true, builtin = true),
                        StickerPackSummary(slug = "fruits", name = "Fruits", author = "Ada", description = "Des fruits"),
                    ),
                    state = StickerPackState(),
                    onToggle = { shopToggles += it },
                    imageModel = { it },
                )
            },
        )
        compose.setContent {
            MeeshyTheme {
                StickerSheet(capabilities = capabilities, usage = usage, destination = { placed += it }, onDismiss = onDismiss)
            }
        }
    }

    private fun tab(name: String) {
        compose.onNodeWithContentDescription(name).performScrollTo().performClick()
    }

    @Test
    fun `les packs integres ont leur onglet sous leur nom, avant que la passerelle reponde`() {
        show()
        compose.onNodeWithContentDescription("Mee").assertIsDisplayed()
        compose.onNodeWithContentDescription("Meo").assertExists()
        compose.onNodeWithContentDescription("Mee & Meo").assertExists()
    }

    @Test
    fun `toucher un film de Mee le pose, le retient et ferme la feuille`() {
        val placed = mutableListOf<StickerSheetChoice>()
        val usage = StickerUsageStore(InMemoryStickerUsageStorage())
        var dismissed = false
        show(placed = placed, usage = usage, onDismiss = { dismissed = true })
        tab("Mee")
        compose.onNodeWithContentDescription("Coucou").performClick()
        assertThat(placed).containsExactly(StickerSheetChoice.Mee("mee-coucou"))
        assertThat(usage.recents.value).containsExactly(StickerUsageEntry.mee("mee-coucou"))
        assertThat(dismissed).isTrue()
    }

    @Test
    fun `un pack de tiers montre ses stickers, un tap remet le sticker du pack`() {
        val placed = mutableListOf<StickerSheetChoice>()
        val fruits = StickerPackSummary(
            slug = "fruits", name = "Fruits", installed = true, author = "Ada",
            items = listOf(StickerPackItemSummary(key = "pomme", title = "Pomme", emoji = "🍎", kind = "static", fileUrl = "/p.png")),
        )
        show(placed = placed, installed = listOf(fruits))
        tab("Fruits")
        compose.onNodeWithText("by Ada").assertIsDisplayed()
        compose.onNodeWithContentDescription("Pomme").performClick()
        assertThat(placed).containsExactly(StickerSheetChoice.PackItem("fruits", "pomme"))
    }

    @Test
    fun `un cadre a mots ne se pose qu'avec des mots, et les porte`() {
        val placed = mutableListOf<StickerSheetChoice>()
        show(placed = placed)
        tab("Custom")
        compose.onNodeWithContentDescription("Speech bubble").performClick()
        assertThat(placed).isEmpty()
        compose.onNode(hasSetTextAction()).performTextInput("Salut")
        compose.onNodeWithContentDescription("Speech bubble — Salut").performClick()
        assertThat(placed).containsExactly(StickerSheetChoice.Template("text.speechBubble", mapOf("text" to "Salut")))
    }

    @Test
    fun `une decoration d'heure pose l'heure lue a l'ouverture`() {
        val placed = mutableListOf<StickerSheetChoice>()
        show(placed = placed)
        tab("Custom")
        compose.onNode(hasScrollToIndexAction()).performScrollToNode(hasContentDescription("Digital clock — ", substring = true))
        compose.onNodeWithContentDescription("Digital clock — ", substring = true).performClick()
        val choice = placed.single() as StickerSheetChoice.Template
        assertThat(choice.templateId).isEqualTo("time.digital")
        assertThat(choice.slots.keys).containsExactly("time", "hour", "minute")
    }

    @Test
    fun `Mes stickers sans bibliotheque n'existe pas, avec elle sert ses vignettes et ses portes`() {
        show()
        tab("Custom")
        assertThat(compose.onAllNodesWithContentDescription("Cut out the subject of a photo").fetchSemanticsNodes()).isEmpty()
    }

    @Test
    fun `une vignette de Mes stickers se pose, Detourer et Coller ne sont servis que s'ils agissent`() {
        val placed = mutableListOf<StickerSheetChoice>()
        var lifted = 0
        val shelf = StickerLibraryShelf(
            items = listOf(StickerLibraryThumb("s1", model = "file:///s1")),
            onPaste = null,
            onLift = { lifted++ },
        )
        show(library = shelf, placed = placed)
        tab("Custom")
        assertThat(compose.onAllNodesWithContentDescription("Paste").fetchSemanticsNodes()).isEmpty()
        compose.onNodeWithContentDescription("Cut out the subject of a photo").performClick()
        assertThat(lifted).isEqualTo(1)
        compose.onNodeWithContentDescription("Sticker from your library").performClick()
        assertThat(placed).containsExactly(StickerSheetChoice.Library("s1"))
    }

    @Test
    fun `une bibliotheque vide dit comment la commencer`() {
        show(library = StickerLibraryShelf(items = emptyList(), onPaste = {}, onLift = null))
        tab("Custom")
        compose.onNodeWithText("Paste an image to start your library").assertIsDisplayed()
        compose.onNodeWithContentDescription("Paste").assertIsDisplayed()
    }

    @Test
    fun `la boutique montre le pack et son auteur, installer remet le geste a l'hote`() {
        val toggles = mutableListOf<String>()
        show(shopToggles = toggles)
        tab("Shop")
        compose.onNodeWithText("Fruits").assertIsDisplayed()
        compose.onNodeWithText("by Ada").assertIsDisplayed()
        compose.onNodeWithContentDescription("Install Fruits").performClick()
        assertThat(toggles).containsExactly("fruits")
    }

    @Test
    fun `un pack integre de la boutique montre son personnage, sans bouton Retirer`() {
        show()
        tab("Shop")
        compose.onNodeWithText("Fruits").assertIsDisplayed()
        val figures = compose.onAllNodes(SemanticsMatcher.keyIsDefined(me.meeshy.ui.component.game.MeeFigureModeKey)).fetchSemanticsNodes()
        assertThat(figures).hasSize(1)
        assertThat(compose.onAllNodesWithText("Remove").fetchSemanticsNodes()).isEmpty()
    }

    @Test
    fun `une intention de Mee dit quand l'employer, comme iOS`() {
        show()
        tab("Mee")
        compose.onNodeWithText("To greet, thank, say yes, apologize or say good night").assertIsDisplayed()
    }
}
