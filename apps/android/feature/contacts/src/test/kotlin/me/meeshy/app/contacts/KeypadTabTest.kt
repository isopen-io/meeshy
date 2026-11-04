package me.meeshy.app.contacts

import androidx.compose.ui.test.junit4.createComposeRule
import org.robolectric.RuntimeEnvironment
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.contacts.R
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class KeypadTabTest {

    @get:Rule
    val compose = createComposeRule()

    private fun text(id: Int): String = RuntimeEnvironment.getApplication().getString(id)

    private val events = mutableListOf<KeypadUiEvent>()
    private val calls = mutableListOf<Triple<String, String, Boolean>>()
    private var profiles = 0

    private fun show(state: KeypadUiState) {
        compose.setContent {
            MeeshyTheme {
                KeypadTabContent(
                    state = state,
                    onEvent = { events += it },
                    onOpenProfile = { profiles++ },
                    onCall = { id, name, video -> calls += Triple(id, name, video) },
                )
            }
        }
    }

    private fun row(conversationId: String?) =
        KeypadRow(UserSearchResult(id = "u1", username = "alice", displayName = "Alice"), conversationId)

    @Test
    fun `toucher une touche ajoute le chiffre`() {
        show(KeypadUiState())

        compose.onNodeWithContentDescription("5").performClick()

        assertThat(events).containsExactly(KeypadUiEvent.Append("5"))
    }

    @Test
    fun `un appui sur retour arriere efface le dernier caractere`() {
        show(KeypadUiState(input = "12"))

        compose.onNodeWithContentDescription(text(R.string.keypad_delete_a11y)).performClick()

        assertThat(events).containsExactly(KeypadUiEvent.DeleteLast)
    }

    @Test
    fun `un appui long sur retour arriere efface tout`() {
        show(KeypadUiState(input = "12"))

        compose.onNodeWithContentDescription(text(R.string.keypad_delete_a11y)).performTouchInput { longClick() }

        assertThat(events).containsExactly(KeypadUiEvent.Clear)
    }

    @Test
    fun `le bouton d'appel ouvre le menu puis demarre un appel video`() {
        show(KeypadUiState(input = "al", rows = listOf(row("c9")), load = KeypadLoad.Loaded))

        compose.onNodeWithContentDescription(text(R.string.keypad_call)).performClick()
        compose.onNodeWithText(text(R.string.keypad_call_video)).performClick()

        assertThat(calls).containsExactly(Triple("c9", "Alice", true))
    }

    @Test
    fun `sans conversation directe le bouton d'appel ouvre le profil`() {
        show(KeypadUiState(input = "al", rows = listOf(row(null)), load = KeypadLoad.Loaded))

        compose.onNodeWithContentDescription(text(R.string.keypad_call)).performClick()

        assertThat(profiles).isEqualTo(1)
        assertThat(calls).isEmpty()
    }

    @Test
    fun `toucher le resultat ouvre le profil`() {
        show(KeypadUiState(input = "al", rows = listOf(row("c9")), load = KeypadLoad.Loaded))

        compose.onNodeWithContentDescription("Alice, @alice").performClick()

        assertThat(profiles).isEqualTo(1)
    }

    @Test
    fun `une recherche sans resultat annonce aucun contact`() {
        show(KeypadUiState(input = "zzz", load = KeypadLoad.Loaded))

        compose.onNodeWithText(text(R.string.keypad_no_match_title)).assertExists()
    }
}
