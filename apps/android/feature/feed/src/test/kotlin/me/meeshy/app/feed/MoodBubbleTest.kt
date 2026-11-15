package me.meeshy.app.feed

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.height
import androidx.compose.ui.unit.width
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.EmojiCatalog
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** #13662 — toucher l'humeur d'un ami ouvre sa bulle : réagir, republier, répondre. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MoodBubbleTest {

    @get:Rule
    val compose = createComposeRule()

    private val reacted = mutableListOf<String>()
    private var republished = 0
    private var replied = 0
    private var dismissed = 0
    private var dwellEnded = 0

    private class FakeLifecycleOwner : LifecycleOwner {
        val registry = LifecycleRegistry(this).apply { currentState = Lifecycle.State.RESUMED }
        override val lifecycle: Lifecycle get() = registry
    }

    private fun show(
        currentUserId: String = "me",
        lifecycleOwner: LifecycleOwner = FakeLifecycleOwner(),
        shown: () -> Boolean = { true },
        rotating: Boolean = false,
    ) {
        val entry = StatusEntry(id = "s1", userId = "u1", username = "amina", moodEmoji = "🔥", content = "En feu")
        compose.setContent {
            CompositionLocalProvider(LocalLifecycleOwner provides lifecycleOwner) {
                MeeshyTheme {
                    if (shown()) {
                        MoodBubble(
                            model = MoodBubbleModel.of(entry, currentUserId),
                            onReact = { reacted += it },
                            onRepublish = { republished++ },
                            onReply = { replied++ },
                            onDismiss = { dismissed++ },
                            onDwellEnd = { dwellEnded++ },
                            isChangingConfigurations = { rotating },
                        )
                    }
                }
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `la bulle montre l humeur et ses trois actions`() {
        show()
        compose.onNodeWithText("amina").assertIsDisplayed()
        compose.onNodeWithText("En feu").assertIsDisplayed()
        compose.onNodeWithContentDescription("Reaction ❤️").assertIsDisplayed()
        compose.onNodeWithContentDescription("Reply").assertIsDisplayed()
        compose.onNodeWithContentDescription("Repost").assertIsDisplayed()
    }

    @Test
    fun `chaque geste atteint son rappel`() {
        show()
        compose.onNodeWithContentDescription("Reaction ❤️").performClick()
        compose.onNodeWithContentDescription("Repost").performClick()
        compose.onNodeWithContentDescription("Reply").performClick()
        assertThat(reacted).containsExactly("❤️")
        assertThat(republished).isEqualTo(1)
        assertThat(replied).isEqualTo(1)
    }

    @Test
    fun `la derniere reaction rapide reste atteignable, la rangee defile`() {
        show()
        val last = EmojiCatalog.defaultQuickReactions.last()
        compose.onNodeWithContentDescription("Reaction $last").performScrollTo().performClick()
        assertThat(reacted).containsExactly(last)
    }

    @Test
    fun `chaque cible de la bulle tient dans 48 dp`() {
        show()
        listOf("Reaction ❤️", "Reply", "Repost").forEach { label ->
            val bounds = compose.onNodeWithContentDescription(label).getUnclippedBoundsInRoot()
            assertThat(bounds.width).isAtLeast(48.dp)
            assertThat(bounds.height).isAtLeast(48.dp)
        }
    }

    @Test
    fun `l application passee en arriere plan ferme la bulle`() {
        val owner = FakeLifecycleOwner()
        show(lifecycleOwner = owner)
        compose.runOnIdle { owner.registry.currentState = Lifecycle.State.CREATED }
        compose.waitForIdle()
        assertThat(dismissed).isEqualTo(1)
    }

    @Test
    fun `une rotation ne ferme pas la bulle, l arriere plan de la recreation n en est pas un`() {
        val owner = FakeLifecycleOwner()
        show(lifecycleOwner = owner, rotating = true)
        compose.runOnIdle { owner.registry.currentState = Lifecycle.State.CREATED }
        compose.waitForIdle()
        assertThat(dismissed).isEqualTo(0)
    }

    @Test
    fun `la bulle retiree ferme sa duree de lecture, une fois`() {
        var visible by mutableStateOf(true)
        show(shown = { visible })
        assertThat(dwellEnded).isEqualTo(0)
        compose.runOnIdle { visible = false }
        compose.waitForIdle()
        assertThat(dwellEnded).isEqualTo(1)
    }
}
