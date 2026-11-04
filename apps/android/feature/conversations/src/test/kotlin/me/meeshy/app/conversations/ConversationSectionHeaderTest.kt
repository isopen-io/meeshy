package me.meeshy.app.conversations

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ConversationSectionHeaderTest {

    @get:Rule
    val compose = createComposeRule()

    private val pinned = ConversationSection(
        kind = ConversationSectionKind.PINNED,
        items = listOf(ApiConversation(id = "a", title = "A", type = "group")),
    )

    private fun show(
        expanded: Boolean,
        sticker: Boolean,
        foldedUnread: Int = 0,
        direction: LayoutDirection = LayoutDirection.Ltr,
        onToggle: (Boolean) -> Unit = {},
    ) = compose.setContent {
        MeeshyTheme {
            CompositionLocalProvider(LocalLayoutDirection provides direction) {
                ConversationSectionHeader(pinned, expanded, foldedUnread, sticker, onToggle)
            }
        }
    }

    private fun hasStateDescription(value: String) =
        SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, value)

    @Test
    fun `le sticker ecrit son titre en majuscules`() {
        show(expanded = true, sticker = true)

        compose.onNodeWithText("PINNED").assertExists()
    }

    @Test
    fun `la peau classique garde le titre tel quel et la capsule de compte`() {
        show(expanded = true, sticker = false)

        compose.onNodeWithText("Pinned").assertExists()
        compose.onNodeWithText("1").assertExists()
    }

    @Test
    fun `depliee la section annonce Developpee sans pastille de non-lus`() {
        show(expanded = true, sticker = true, foldedUnread = 5)

        compose.onNodeWithText("PINNED").assert(hasStateDescription("Expanded"))
        compose.onNodeWithText("5").assertDoesNotExist()
    }

    @Test
    fun `repliee la section annonce son etat et porte la pastille des non-lus caches`() {
        show(expanded = false, sticker = false, foldedUnread = 5)

        compose.onNodeWithText("Pinned").assert(
            SemanticsMatcher("l'état commence par Collapsed") {
                it.config.getOrNull(SemanticsProperties.StateDescription)?.startsWith("Collapsed") == true
            },
        )
        compose.onNodeWithText("5", useUnmergedTree = true).assertExists()
    }

    @Test
    fun `un toucher bascule la section dans les deux peaux, en RTL aussi`() {
        val seen = mutableListOf<Boolean>()
        show(expanded = true, sticker = true, direction = LayoutDirection.Rtl) { seen += it }

        compose.onNodeWithText("PINNED").performClick()
        compose.waitForIdle()

        assertThat(seen).containsExactly(false)
    }
}
