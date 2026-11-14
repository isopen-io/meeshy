package me.meeshy.app.chat.options

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasAnyDescendant
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.sdk.model.conversationoptions.ArchiveGesture
import me.meeshy.sdk.model.conversationoptions.ConversationOptionsPlan
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Épure 3/3 du fil (#17697, règle 6) : au repos, les Options portent Partager, Archiver et les réglages ;
 * Quitter, Bloquer, Supprimer pour moi et Rendre obsolète vivent derrière « Plus », atteignables en un geste,
 * leurs confirmations de conséquence inchangées.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class EpureOptionsPlusTest {

    @get:Rule
    val compose = createComposeRule()

    private fun plan(
        leave: Boolean = true,
        block: String? = "peer-1",
        deleteForMe: Boolean = true,
        obsolete: Boolean = true,
        toggleArchive: Boolean = true,
    ) = ConversationOptionsPlan(
        share = true, leave = leave, leaveGroup = leave, blockUserId = block,
        toggleArchive = toggleArchive, deleteForMe = deleteForMe, obsolete = obsolete,
    )

    private val asked = mutableListOf<OptionsDialog>()

    private fun setRows(plan: ConversationOptionsPlan) = compose.setContent {
        MeeshyTheme { OptionsActionRows(plan, ArchiveGesture.ARCHIVE) { asked += it } }
    }

    private val rare = listOf("Leave", "Block this user", "Delete for me", "Make obsolete")

    @Test
    fun atRest_theScreenCarriesArchiveAndMoreOnly() {
        setRows(plan())
        compose.onNodeWithText("Archive", useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithText("More", useUnmergedTree = true).assertIsDisplayed()
        rare.forEach { compose.onNodeWithText(it, useUnmergedTree = true).assertDoesNotExist() }
    }

    @Test
    fun moreUnfoldsTheFourRareActions() {
        setRows(plan())
        compose.onNodeWithText("More", useUnmergedTree = true).performClick()
        rare.forEach { compose.onNodeWithText(it, useUnmergedTree = true).assertIsDisplayed() }
    }

    @Test
    fun moreTellsTheScreenReaderWhetherItIsUnfolded() {
        setRows(plan())
        val more = hasClickAction() and hasAnyDescendant(hasText("More"))
        fun state() = compose.onNode(more, useUnmergedTree = true).fetchSemanticsNode().config.getOrNull(SemanticsProperties.StateDescription)
        assertThat(state()).isEqualTo("Collapsed")
        compose.onNode(more, useUnmergedTree = true).performClick()
        assertThat(state()).isEqualTo("Expanded")
    }

    @Test
    fun eachRareActionIsOneTapAfterMore_andAsksItsOwnConfirmation() {
        setRows(plan())
        val expected = mapOf(
            "Leave" to OptionsDialog.LEAVE, "Block this user" to OptionsDialog.BLOCK,
            "Delete for me" to OptionsDialog.DELETE, "Make obsolete" to OptionsDialog.OBSOLETE,
        )
        expected.forEach { (label, dialog) ->
            compose.onNodeWithText("More", useUnmergedTree = true).performClick()
            compose.onNodeWithText(label, useUnmergedTree = true).performClick()
            assertThat(asked.last()).isEqualTo(dialog)
        }
    }

    @Test
    fun anActionTheGatewayWouldRefuseIsNotListedBehindMore() {
        setRows(plan(leave = false, block = null, deleteForMe = true, obsolete = false))
        compose.onNodeWithText("More", useUnmergedTree = true).performClick()
        compose.onNodeWithText("Delete for me", useUnmergedTree = true).assertIsDisplayed()
        listOf("Leave", "Block this user", "Make obsolete").forEach {
            compose.onNodeWithText(it, useUnmergedTree = true).assertDoesNotExist()
        }
    }

    @Test
    fun withNothingRare_thereIsNoMore() {
        setRows(plan(leave = false, block = null, deleteForMe = false, obsolete = false))
        compose.onNodeWithText("Archive", useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithText("More", useUnmergedTree = true).assertDoesNotExist()
    }

    @Test
    fun theHeaderNoLongerCarriesTheRedLeavePill() {
        val root = generateSequence(File(System.getProperty("user.dir").orEmpty()).absoluteFile) { it.parentFile }
            .first { File(it, "feature/chat/src/main/kotlin").isDirectory }
        val content = File(root, "feature/chat/src/main/kotlin/me/meeshy/app/chat/options/ConversationOptionsContent.kt").readText()
        assertThat(Regex("OptionsPillButton\\(").findAll(content).count()).isEqualTo(1)
        assertThat(content).contains("R.string.conversation_options_share")
    }
}
