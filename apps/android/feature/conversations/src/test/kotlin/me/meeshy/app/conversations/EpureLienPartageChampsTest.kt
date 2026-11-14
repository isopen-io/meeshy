package me.meeshy.app.conversations

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import me.meeshy.sdk.model.MyShareLink
import me.meeshy.sdk.model.ShareLinkEditDraft
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Épure 2/3 de la liste et du fil (#17697, règle 1) : les champs « nom » et « message d'invitation » du
 * formulaire d'un lien ne portent plus leur précision dans le libellé, elle passe derrière un (i) dont le
 * nom accessible est la QUESTION ; l'état d'erreur du choix de conversation tient en une ligne + Réessayer.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class EpureLienPartageChampsTest {

    @get:Rule
    val compose = createComposeRule()

    private val folders = listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar")

    private val moduleRoot: File = generateSequence(File(System.getProperty("user.dir").orEmpty()).absoluteFile) { it.parentFile }
        .first { File(it, "feature/conversations/src/main/res").isDirectory }

    private val resDir = File(moduleRoot, "feature/conversations/src/main/res")
    private val pattern = Regex("""<string name="([^"]+)"[^>]*>(.*?)</string>""", RegexOption.DOT_MATCHES_ALL)

    private fun all(folder: String): Map<String, String> =
        File(resDir, folder).listFiles { f -> f.extension == "xml" }.orEmpty().flatMap { file ->
            pattern.findAll(file.readText()).map { it.groupValues[1] to it.groupValues[2].replace("\\'", "'") }.toList()
        }.toMap()

    private fun setForm() = compose.setContent {
        MeeshyTheme {
            ShareLinkEditForm(
                draft = ShareLinkEditDraft.from(MyShareLink(id = "link-1", name = "Invitation")),
                isActive = true,
                canSave = false,
                isSaving = false,
                nowMillis = 0L,
                onDraftChange = {},
                onSave = {},
                onToggleActive = {},
                onDelete = {},
            )
        }
    }

    @Test
    fun nameField_isShortAndItsNoteIsBehindAnInfoButtonNamedByTheQuestion() {
        setForm()
        compose.onNodeWithText("Link name", useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithContentDescription("Who sees this name?", useUnmergedTree = true).assertExists()
        assertThat(
            compose.onNode(hasContentDescription("Who sees this name?"), useUnmergedTree = true).fetchSemanticsNode()
                .config.getOrNull(SemanticsProperties.StateDescription),
        ).isEqualTo("Only you see it; guests don't.")
    }

    @Test
    fun messageField_isShortAndItsNoteIsBehindAnInfoButtonNamedByTheQuestion() {
        setForm()
        compose.onNodeWithText("Invitation message", useUnmergedTree = true).assertIsDisplayed()
        assertThat(
            compose.onNode(hasContentDescription("Who reads this message?"), useUnmergedTree = true).fetchSemanticsNode()
                .config.getOrNull(SemanticsProperties.StateDescription),
        ).isEqualTo("Guests who open the link see it.")
    }

    @Test
    fun theScreenReaderCloseAction_foldsTheOpenNote() {
        setForm()
        compose.onNodeWithContentDescription("Who sees this name?", useUnmergedTree = true).performClick()
        compose.onNodeWithText("Only you see it; guests don't.", useUnmergedTree = true)
            .performSemanticsAction(SemanticsActions.Dismiss)
        compose.onNodeWithText("Only you see it; guests don't.", useUnmergedTree = true).assertDoesNotExist()
    }

    @Test
    fun tappingTheInfoButton_unfoldsTheNoteUnderTheField() {
        setForm()
        compose.onNodeWithText("Only you see it; guests don't.", useUnmergedTree = true).assertDoesNotExist()
        compose.onNodeWithContentDescription("Who sees this name?", useUnmergedTree = true).performClick()
        compose.onNodeWithText("Only you see it; guests don't.", useUnmergedTree = true).assertIsDisplayed()
    }

    @Test
    fun theLongLabelsAreGoneFromTheSevenFolders() {
        val expected = mapOf(
            "values" to Triple("Link name", "Invitation message", "Only you see it; guests don't."),
            "values-fr" to Triple("Nom du lien", "Message d'invitation", "Toi seul le vois ; les invités ne le voient pas."),
        )
        folders.forEach { folder ->
            val strings = all(folder)
            assertWithMessage(folder).that(strings["shareLink_detail_nameField"]).doesNotContain("(")
            assertWithMessage(folder).that(strings["shareLink_detail_messageField"]).doesNotContain("(")
            assertWithMessage(folder).that(strings["shareLink_detail_messageField"]).isEqualTo(strings["invite_messageLabel"])
            listOf("share_link_name_question", "share_link_name_note",
                "share_link_message_question", "share_link_message_note").forEach { key ->
                assertWithMessage("$folder/$key").that(strings[key]).isNotEmpty()
            }
            expected[folder]?.let { (name, message, note) ->
                assertThat(strings["shareLink_detail_nameField"]).isEqualTo(name)
                assertThat(strings["shareLink_detail_messageField"]).isEqualTo(message)
                assertThat(strings["share_link_name_note"]).isEqualTo(note)
            }
            if (folder != "values") {
                assertWithMessage("$folder traduit").that(strings["share_link_name_question"])
                    .isNotEqualTo(all("values")["share_link_name_question"])
            }
        }
    }

    @Test
    fun theErrorTitleOfTheShareLinkPickerLeavesTheScreenAndTheSevenFolders() {
        val screen = File(moduleRoot, "feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ShareLinkPickerScreen.kt").readText()
        assertThat(screen).doesNotContain("conversations_error_title")
        assertThat(screen).contains("conversations_error_subtitle")
        assertThat(screen).contains("conversations_retry")
        folders.forEach { assertWithMessage(it).that(all(it)).doesNotContainKey("conversations_error_title") }
        val manifest = File(moduleRoot, "i18n/manifest").walkTopDown().filter { it.extension == "json" }.joinToString("\n") { it.readText() }
        assertThat(manifest).doesNotContain("\"androidName\": \"conversations_error_title\"")
    }
}
