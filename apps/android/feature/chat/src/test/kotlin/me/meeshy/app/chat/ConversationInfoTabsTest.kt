package me.meeshy.app.chat

import androidx.compose.material3.Text
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * La fiche Conversation range Membres, Médias, Stats et Options en onglets, comme iOS `ConversationInfoSheet`
 * (#13785) : Membres s'ouvre d'abord, un toucher sur un onglet montre son contenu et le dit sélectionné, et
 * l'aperçu des épinglés montre les deux plus récents puis « Voir les N » au-delà.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr")
class ConversationInfoTabsTest {

    @get:Rule
    val compose = createComposeRule()

    private fun pin(id: String) = PinnedMessageRow(messageId = id, senderName = "Ana", isOutgoing = false, snippet = PinnedSnippet.Text("m-$id"))

    private val slots = ConversationInfoTabSlots(
        members = { Text("contenu-membres") },
        media = { Text("contenu-medias") },
        stats = { Text("contenu-stats") },
        options = { Text("contenu-options") },
    )

    @Test
    fun `the four tabs follow the iOS order`() {
        assertThat(ConversationInfoTab.entries).containsExactly(
            ConversationInfoTab.MEMBERS,
            ConversationInfoTab.MEDIA,
            ConversationInfoTab.STATS,
            ConversationInfoTab.OPTIONS,
        ).inOrder()
    }

    @Test
    fun `the members tab opens first and a tap on Options shows the options`() {
        compose.setContent { MeeshyTheme { ConversationInfoTabbedArea(accentColor = Color.Blue, slots = slots) } }

        compose.onNodeWithText("contenu-membres").assertExists()
        compose.onNodeWithText("Membres").assertIsSelected()

        compose.onNodeWithText("Options").performClick()

        compose.onNodeWithText("contenu-options").assertExists()
        compose.onNodeWithText("contenu-membres").assertDoesNotExist()
        compose.onNodeWithText("Options").assertIsSelected()
        compose.onNode(SemanticsMatcher.expectValue(SemanticsProperties.Selected, true)).assertExists()
    }

    @Test
    fun `the pinned preview shows the two newest pins and no see-all up to two`() {
        val preview = ConversationInfoPinnedPreview.of(listOf(pin("a"), pin("b")))

        assertThat(preview?.rows?.map { it.messageId }).containsExactly("a", "b").inOrder()
        assertThat(preview?.seeAllCount).isNull()
    }

    @Test
    fun `beyond two pins the preview offers to see them all`() {
        val preview = ConversationInfoPinnedPreview.of(listOf(pin("a"), pin("b"), pin("c")))

        assertThat(preview?.rows?.map { it.messageId }).containsExactly("a", "b").inOrder()
        assertThat(preview?.seeAllCount).isEqualTo(3)
    }

    @Test
    fun `nothing pinned shows no preview`() {
        assertThat(ConversationInfoPinnedPreview.of(emptyList())).isNull()
    }

    @Test
    fun `a tap on the pinned preview opens the pinned list`() {
        var opened = 0
        compose.setContent {
            MeeshyTheme {
                ConversationInfoPinnedPreviewCard(
                    preview = ConversationInfoPinnedPreview.of(listOf(pin("a"), pin("b"), pin("c")))!!,
                    accentColor = Color.Blue,
                    onOpen = { opened++ },
                )
            }
        }

        compose.onNodeWithText("Voir les 3 messages épinglés", substring = true).performClick()

        assertThat(opened).isEqualTo(1)
    }
}
