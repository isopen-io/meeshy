package me.meeshy.app.contacts

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.friend.ConnectAction
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class DiscoverTabTest {

    @get:Rule
    val compose = createComposeRule()

    private fun show(state: DiscoverUiState, onOpenProfile: (String) -> Unit = {}) {
        compose.setContent {
            MeeshyTheme {
                DiscoverContent(
                    state = state,
                    isActive = true,
                    onCollapseProgressChange = {},
                    onQueryChanged = {},
                    onEmailChanged = {},
                    onSendEmail = {},
                    onPhoneChanged = {},
                    onSendSms = {},
                    onRefresh = {},
                    onRetry = {},
                    onAdd = {},
                    onAccept = {},
                    onDecline = {},
                    onCancel = {},
                    onOpenProfile = onOpenProfile,
                )
            }
        }
    }

    @Test
    fun `the email card sits above the SMS card, above the search field`() {
        show(DiscoverUiState())

        val email = compose.onNodeWithText("Invite by email").getUnclippedBoundsInRoot().top
        val sms = compose.onNodeWithText("Invite by SMS").getUnclippedBoundsInRoot().top
        val search = compose.onNodeWithText("Search for a Meeshy user").getUnclippedBoundsInRoot().top

        assertThat(email).isLessThan(sms)
        assertThat(sms).isLessThan(search)
    }

    @Test
    fun `a searchable query with no match shows the no users found state`() {
        show(DiscoverUiState(query = "zzz"))

        compose.onNodeWithText("No user found").assertIsDisplayed()
    }

    @Test
    fun `an empty idle tab shows the search prompt`() {
        show(DiscoverUiState())

        compose.onNodeWithText("Search for people to connect with").assertIsDisplayed()
    }

    @Test
    fun `tapping a result name opens the profile`() {
        var opened: String? = null
        val rows = listOf(DiscoverRow(UserSearchResult(id = "u1", username = "alice"), ConnectAction.Connect))
        show(DiscoverUiState(query = "ali", rows = rows), onOpenProfile = { opened = it })

        compose.onNodeWithText("alice").performClick()

        assertThat(opened).isEqualTo("u1")
    }

    @Test
    fun `the cascade delays each row by forty milliseconds`() {
        assertThat(cascadeDelayMillis(0)).isEqualTo(0L)
        assertThat(cascadeDelayMillis(3)).isEqualTo(120L)
    }
}
