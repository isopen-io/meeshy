package me.meeshy.app.contacts

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.friend.ConnectAction
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Toucher un contact, un résultat de découverte ou un bloqué appelle l'ouvreur de fiche (#14748). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ContactsProfileTapTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `toucher un contact ouvre sa fiche`() {
        var opened = 0
        val friend = FriendRequestUser(id = "u1", username = "alice")
        compose.setContent { MeeshyTheme { FriendRow(friend = friend, moodEmoji = null, onClick = { opened++ }) } }

        compose.onNodeWithText("alice").performClick()

        assertThat(opened).isEqualTo(1)
    }

    @Test
    fun `toucher un resultat de decouverte ouvre sa fiche`() {
        var opened = 0
        val user = UserSearchResult(id = "u2", username = "bob")
        compose.setContent {
            MeeshyTheme { ResultRow(DiscoverRow(user, ConnectAction.Connect), {}, {}, {}, {}, { opened++ }) }
        }

        compose.onNodeWithText("bob").performClick()

        assertThat(opened).isEqualTo(1)
    }
}
