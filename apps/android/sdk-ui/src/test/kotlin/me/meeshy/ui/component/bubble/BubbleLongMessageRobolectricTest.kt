package me.meeshy.ui.component.bubble

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.focal.FlatRowExpansion
import me.meeshy.ui.component.focal.LocalFlatRowExpansion
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** #16465 — en mode Bulles aussi, un long message s'ouvre sur son extrait et se déplie pour de bon (iOS #16463). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BubbleLongMessageRobolectricTest {

    @get:Rule
    val compose = createComposeRule()

    private val long = (1..140).joinToString(" ") { "mot$it" }

    private fun content(text: String) = BubbleContent(
        messageId = "m1",
        text = text,
        isOutgoing = false,
        isTranslated = false,
        originalText = null,
        senderName = "Mégane",
        showSenderName = false,
        isEdited = false,
        isDeleted = false,
        createdAtIso = "2026-10-01T07:48:00Z",
    )

    @Test
    fun `#16465 une bulle longue montre l'extrait et Lire la suite, puis le texte entier sans aucun repli`() {
        compose.setContent { MeeshyTheme { MessageBubble(content = content(long)) } }

        compose.onNodeWithText(long, useUnmergedTree = true).assertDoesNotExist()
        compose.onNodeWithText("Read more", useUnmergedTree = true).performClick()
        compose.waitForIdle()

        compose.onNodeWithText(long, useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithText("Read more", useUnmergedTree = true).assertDoesNotExist()
        compose.onNodeWithText("Show less", useUnmergedTree = true).assertDoesNotExist()
    }

    @Test
    fun `#16465 sous l'hote du fil, le toucher de la bulle passe par l'expansion`() {
        var expanded = 0
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalFlatRowExpansion provides FlatRowExpansion(isExpanded = false) { expanded++ }) {
                    MessageBubble(content = content(long))
                }
            }
        }

        compose.onNodeWithText("Read more", useUnmergedTree = true).performClick()

        assertThat(expanded).isEqualTo(1)
    }

    @Test
    fun `#16465 une bulle courte n'a aucun bouton`() {
        compose.setContent { MeeshyTheme { MessageBubble(content = content("Bonsoir à tous")) } }

        compose.onNodeWithText("Bonsoir à tous", useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithText("Read more", useUnmergedTree = true).assertDoesNotExist()
    }
}
