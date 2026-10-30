package me.meeshy.app.stories

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PostMentionInput
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** « Déjà référencées » de la feuille Mentionner (#13846, iOS `StoryMentionPickerSheet.alreadyReferenced`). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp")
class StoryMentionAlreadyReferencedTest {

    @get:Rule
    val compose = createComposeRule()

    private val ana = PostMentionInput(userId = "1", username = "ana", display = "PINNED")
    private val bob = PostMentionInput(userId = "2", username = "bob", display = "SILENT")

    @Test
    fun `a named person is retired by its cross, and changes mode from its chip`() {
        val changes = mutableListOf<List<PostMentionInput>>()
        compose.setContent { MeeshyTheme { AlreadyReferenced(listOf(ana, bob), onChange = { changes += it }) } }

        compose.onNodeWithContentDescription("Remove @ana").performClick()
        compose.onNodeWithText("@bob · Silently").performClick()
        compose.onNodeWithText("In “With …”").performClick()

        assertThat(changes).containsExactly(listOf(bob), listOf(ana, bob.copy(display = "NOTE"))).inOrder()
    }

    @Test
    fun `nobody named yet shows no section`() {
        compose.setContent { MeeshyTheme { AlreadyReferenced(emptyList(), onChange = {}) } }
        compose.onAllNodesWithText("Already named").assertCountEquals(0)
    }
}
