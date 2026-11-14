package me.meeshy.app.conversations

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * La feuille « Nouvelle conversation » reprend la disposition iOS (`NewConversationView`, #14660) :
 * (X) puis titre puis « Créer » ; recherche, interrupteur « Nouveau groupe », nom du groupe, puces,
 * et la liste qui s'ouvre sur la ligne « Chiffrement · <mode> » repliée.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class NewConversationSheetLayoutTest {

    @get:Rule
    val compose = createComposeRule()

    private fun show(
        initial: NewConversationUiState,
        onClose: () -> Unit = {},
        onTapUser: (String) -> Unit = {},
    ) {
        compose.setContent {
            var state by remember { mutableStateOf(initial) }
            MeeshyTheme {
                NewConversationSheet(
                    state = state,
                    actions = NewConversationActions(
                        onClose = onClose,
                        onCreate = {},
                        onQueryChange = { q -> state = state.copy(query = q) },
                        onToggleGroup = { state = state.copy(groupRequested = !state.groupRequested) },
                        onGroupTitleChange = { t -> state = state.copy(groupTitle = t) },
                        onToggleEncryption = { state = state.copy(encryptionExpanded = !state.encryptionExpanded) },
                        onSelectEncryption = {},
                        onToggleUser = {},
                        onTapUser = onTapUser,
                        onRowShown = {},
                    ),
                )
            }
        }
    }

    private fun top(tag: String) = compose.onNodeWithTag(tag, useUnmergedTree = true).getUnclippedBoundsInRoot().top

    @Test
    fun the_sheet_opens_light_with_no_title_field_no_create_and_its_encryption_row() {
        show(NewConversationUiState())

        compose.onNodeWithTag(NewConversationTags.CLOSE).assertIsDisplayed()
        compose.onNodeWithTag(NewConversationTags.SEARCH).assertIsDisplayed()
        compose.onNodeWithTag(NewConversationTags.GROUP_TOGGLE).assertIsDisplayed()
        compose.onNodeWithTag(NewConversationTags.GROUP_TITLE).assertDoesNotExist()
        compose.onNodeWithTag(NewConversationTags.ENCRYPTION_ROW).assertIsDisplayed()
        compose.onNodeWithTag(NewConversationTags.CREATE).assertDoesNotExist()
    }

    @Test
    fun the_sections_follow_the_ios_order() {
        show(NewConversationUiState(groupRequested = true))

        val search = top(NewConversationTags.SEARCH)
        val toggle = top(NewConversationTags.GROUP_TOGGLE)
        val title = top(NewConversationTags.GROUP_TITLE)
        val encryption = top(NewConversationTags.ENCRYPTION_ROW)

        assertThat(top(NewConversationTags.CLOSE)).isLessThan(search)
        assertThat(search).isLessThan(toggle)
        assertThat(toggle).isLessThan(title)
        assertThat(title).isLessThan(encryption)
    }

    @Test
    fun touching_new_group_reveals_the_required_title_and_a_create_that_waits_for_it() {
        show(NewConversationUiState())

        compose.onNodeWithTag(NewConversationTags.GROUP_TOGGLE).performClick()

        compose.onNodeWithTag(NewConversationTags.GROUP_TITLE).assertIsDisplayed()
        compose.onNodeWithTag(NewConversationTags.CREATE).assertIsNotEnabled()
    }

    @Test
    fun the_encryption_row_is_folded_and_unfolds_on_touch() {
        show(NewConversationUiState(groupRequested = true))

        compose.onNodeWithTag(NewConversationTags.ENCRYPTION_OPTIONS).assertDoesNotExist()
        compose.onNodeWithTag(NewConversationTags.ENCRYPTION_ROW).performClick()
        compose.onNodeWithTag(NewConversationTags.ENCRYPTION_OPTIONS).assertExists()
        compose.onNodeWithTag(NewConversationTags.ENCRYPTION_ROW).performClick()
        compose.onNodeWithTag(NewConversationTags.ENCRYPTION_OPTIONS).assertDoesNotExist()
    }

    @Test
    fun the_cross_closes_the_sheet() {
        var closed = 0
        show(NewConversationUiState(), onClose = { closed++ })

        compose.onNodeWithTag(NewConversationTags.CLOSE).performClick()

        assertThat(closed).isEqualTo(1)
    }

    private fun person(id: String) = SelectableUser(id = id, displayName = id.uppercase(), username = id, avatarUrl = null, isOnline = false)

    @Test
    fun in_direct_mode_one_tap_on_a_person_opens_the_conversation() {
        val tapped = mutableListOf<String>()
        show(NewConversationUiState(contacts = listOf(person("ann"))), onTapUser = { tapped += it })

        compose.onNodeWithTag(NewConversationTags.row("ann")).performClick()

        assertThat(tapped).containsExactly("ann")
        compose.onNodeWithTag(NewConversationTags.CREATE).assertDoesNotExist()
    }

    @Test
    fun while_a_conversation_opens_its_row_spins_and_every_row_waits() {
        show(
            NewConversationUiState(
                contacts = listOf(person("ann"), person("bob")),
                isCreating = true,
                openingUserId = "ann",
            ),
        )

        compose.onNodeWithTag(NewConversationTags.OPENING, useUnmergedTree = true).assertExists()
        compose.onNodeWithTag(NewConversationTags.row("ann")).assertIsNotEnabled()
        compose.onNodeWithTag(NewConversationTags.row("bob")).assertIsNotEnabled()
    }
}
