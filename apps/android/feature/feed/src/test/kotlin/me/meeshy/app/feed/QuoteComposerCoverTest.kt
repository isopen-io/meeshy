package me.meeshy.app.feed

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.presentation.COVER_MILLIS
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Citer un post monte le compositeur en plein écran, comme `QuoteComposerCover` sur iOS (#18271, android-fil-02#2) :
 * la croix et Republier jouent la descente du plein écran avant de rendre la main, une seule fois.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-xhdpi")
class QuoteComposerCoverTest {

    @get:Rule
    val compose = createComposeRule()

    private class Record {
        var dismissed = 0
        var submitted = 0
    }

    private fun show(record: Record) {
        compose.setContent {
            var open by remember { mutableStateOf(true) }
            MeeshyTheme {
                if (open) {
                    QuoteComposerSheet(
                        composer = QuoteComposerState(postId = "p1", sourceAuthorName = "Awa", sourceContentPreview = "Le coucher de soleil"),
                        onTextChange = {},
                        onSubmit = { record.submitted++; open = false },
                        onDismiss = { record.dismissed++; open = false },
                    )
                }
            }
        }
        compose.waitForIdle()
    }

    private fun clickAction(node: SemanticsNodeInteraction): () -> Unit {
        val action = node.fetchSemanticsNode().config[SemanticsActions.OnClick].action
        return { compose.runOnUiThread { action?.invoke() } }
    }

    @Test
    fun `the cross plays the cover exit, then closes once even when touched twice`() {
        val record = Record()
        show(record)

        val close = clickAction(compose.onNodeWithContentDescription("Close"))

        compose.mainClock.autoAdvance = false
        close()
        compose.mainClock.advanceTimeBy(COVER_MILLIS / 3L)
        assertThat(record.dismissed).isEqualTo(0)

        close()
        compose.mainClock.advanceTimeBy(COVER_MILLIS * 2L)
        compose.mainClock.autoAdvance = true
        compose.waitForIdle()

        assertThat(record.dismissed).isEqualTo(1)
        assertThat(record.submitted).isEqualTo(0)
    }

    @Test
    fun `Repost lets the cover go down before handing the quote over, once`() {
        val record = Record()
        show(record)

        val repost = clickAction(compose.onNodeWithText("Repost"))

        compose.mainClock.autoAdvance = false
        repost()
        compose.mainClock.advanceTimeBy(COVER_MILLIS / 3L)
        assertThat(record.submitted).isEqualTo(0)

        repost()
        compose.mainClock.advanceTimeBy(COVER_MILLIS * 2L)

        compose.mainClock.autoAdvance = true
        compose.waitForIdle()

        assertThat(record.submitted).isEqualTo(1)
        assertThat(record.dismissed).isEqualTo(0)
    }

    @Test
    fun `Repost touched while the cross is already closing hands nothing over`() {
        val record = Record()
        show(record)

        val close = clickAction(compose.onNodeWithContentDescription("Close"))
        val repost = clickAction(compose.onNodeWithText("Repost"))

        compose.mainClock.autoAdvance = false
        close()
        compose.mainClock.advanceTimeBy(COVER_MILLIS / 3L)
        repost()
        compose.mainClock.advanceTimeBy(COVER_MILLIS * 2L)
        compose.mainClock.autoAdvance = true
        compose.waitForIdle()

        assertThat(record.dismissed).isEqualTo(1)
        assertThat(record.submitted).isEqualTo(0)
    }
}
