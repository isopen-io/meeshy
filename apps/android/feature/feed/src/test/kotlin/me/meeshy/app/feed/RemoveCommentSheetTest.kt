package me.meeshy.app.feed

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performTextInput
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.presentation.MeeshySheetPresence
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Le motif d'un retrait par la modération se saisit dans une FEUILLE à poignée, comme `ContentRemovalReasonSheet` sur
 * iOS (`.pageSheet`, poignée visible) — plus dans une boîte d'alerte centrée (#18271, android-fil-01#8).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-xhdpi")
class RemoveCommentSheetTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `the removal reason is asked in a sheet that carries a drag handle`() {
        compose.setContent { MeeshyTheme { RemoveCommentDialog(onDismiss = {}, onConfirm = {}) } }
        compose.waitForIdle()

        compose.onNodeWithContentDescription("Drag handle", substring = true, ignoreCase = true).assertExists()
    }

    @Test
    fun `a valid reason is handed over once, and Remove cannot send it twice`() {
        val confirmed = mutableListOf<String>()
        compose.setContent {
            var removing by remember { mutableStateOf<String?>("c1") }
            MeeshyTheme {
                MeeshySheetPresence(removing) {
                    RemoveCommentDialog(onDismiss = { removing = null }, onConfirm = { confirmed += it; removing = null })
                }
            }
        }
        compose.waitForIdle()

        compose.onNodeWithText("Reason (required, 3 characters minimum)").performTextInput("Spam répété")
        val remove = compose.onNodeWithText("Remove").fetchSemanticsNode().config[SemanticsActions.OnClick].action
        compose.runOnUiThread { remove?.invoke(); remove?.invoke() }
        compose.waitForIdle()

        assertThat(confirmed).containsExactly("Spam répété")
    }
}
