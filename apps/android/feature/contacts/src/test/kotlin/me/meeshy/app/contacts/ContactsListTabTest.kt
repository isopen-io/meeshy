package me.meeshy.app.contacts

import androidx.compose.material3.Text
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.assertDoesNotExist
import androidx.compose.ui.test.assertExists
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.friend.ContactFilter
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ContactsListTabTest {

    @get:Rule
    val compose = createComposeRule()

    private fun friend(id: String, online: Boolean) =
        FriendRequestUser(id = id, username = id, isOnline = online)

    private fun show(
        state: ContactsListUiState,
        onFilter: (ContactFilter) -> Unit = {},
        onOpenProfile: (String) -> Unit = {},
        phonebookContent: (@androidx.compose.runtime.Composable () -> Unit)? = null,
        phonebookCount: Int = 0,
    ) {
        compose.setContent {
            MeeshyTheme {
                ContactsListContent(
                    state = state,
                    onSearch = {},
                    onFilter = onFilter,
                    onRefresh = {},
                    onRetry = {},
                    onOpenProfile = onOpenProfile,
                    onOpenStatus = {},
                    phonebookCount = phonebookCount,
                    phonebookContent = phonebookContent,
                )
            }
        }
    }

    @Test
    fun `tapping a row opens the profile`() {
        var opened: String? = null
        show(ContactsListUiState(friends = listOf(friend("alice", true))), onOpenProfile = { opened = it })

        compose.onNodeWithText("alice").performClick()

        assertThat(opened).isEqualTo("alice")
    }

    @Test
    fun `the filter row shows the five filters with counts hidden at zero`() {
        show(ContactsListUiState(friends = listOf(friend("a", true), friend("b", false))), phonebookCount = 3)

        compose.onNodeWithText("All (2)").assertExists()
        compose.onNodeWithText("Online (1)").assertExists()
        compose.onNodeWithText("Offline (1)").assertExists()
        compose.onNodeWithText("Phonebook (3)").assertExists()
        compose.onNodeWithText("Affiliates").assertExists()
    }

    @Test
    fun `choosing a filter reports it`() {
        var chosen: ContactFilter? = null
        show(ContactsListUiState(friends = listOf(friend("a", true))), onFilter = { chosen = it })

        compose.onNodeWithText("Offline", substring = true).performClick()

        assertThat(chosen).isEqualTo(ContactFilter.Offline)
    }

    @Test
    fun `the phonebook filter shows the slot the hub provides`() {
        show(
            ContactsListUiState(friends = listOf(friend("a", true)), filter = ContactFilter.Phonebook),
            phonebookContent = { Text("phonebook-slot") },
        )

        compose.onNodeWithText("phonebook-slot").assertExists()
        compose.onNodeWithText("a").assertDoesNotExist()
    }

    @Test
    fun `an empty settled roster says no contacts and hides the search field`() {
        show(ContactsListUiState())

        compose.onNodeWithText("No contacts").assertExists()
        compose.onNodeWithText("Search for a contact").assertDoesNotExist()
    }

    @Test
    fun `a search that matches nothing says no results`() {
        show(ContactsListUiState(friends = listOf(friend("alice", true)), query = "zzz"))

        compose.onNodeWithText("No results").assertExists()
    }
}
