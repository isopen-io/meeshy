package me.meeshy.ui.component.focal

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.bubble.ReactionEntry
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FocalChipsBandTest {

    @get:Rule
    val compose = createComposeRule()

    private fun flags(vararg codes: String, active: String) =
        codes.map { FocalFlag(code = it, glyph = it.uppercase(), description = "lang-$it", isActive = it == active) }

    private fun show(state: FocalChipsBandState, actions: FocalChipsBandActions = FocalChipsBandActions()) {
        compose.setContent { MeeshyTheme { FocalChipsBand(state = state, accent = Color.Blue, actions = actions) } }
    }

    private fun state(
        flags: List<FocalFlag> = emptyList(),
        reactions: List<ReactionEntry> = emptyList(),
        translatable: Boolean = true,
    ) = FocalChipsBandState(translatable, flags, reactions, timestampLabel = "Hier 18:30")

    @Test
    fun `cinq drapeaux au plus et la langue servie reste visible`() {
        show(state(flags = flags("fr", "en", "es", "de", "it", "pt", "ar", active = "ar")))
        val shown = compose.onAllNodes(hasContentDescription("lang-", substring = true)).fetchSemanticsNodes()
        assertThat(shown).hasSize(5)
        compose.onNodeWithContentDescription("lang-ar").assertExists()
        compose.onNodeWithContentDescription("lang-pt").assertDoesNotExist()
    }

    @Test
    fun `sans plusieurs langues ni details ni drapeaux`() {
        show(state(flags = flags("fr", active = "fr"), translatable = false))
        compose.onNodeWithContentDescription("lang-fr").assertDoesNotExist()
        compose.onNodeWithContentDescription("Translation details").assertDoesNotExist()
    }

    @Test
    fun `un tap sur une reaction la bascule`() {
        val toggled = mutableListOf<String>()
        show(
            state(reactions = listOf(ReactionEntry("👍", 2, includesMe = true))),
            FocalChipsBandActions(onReactionToggle = { toggled += it }),
        )
        compose.onNodeWithContentDescription("👍 2").performClick()
        assertThat(toggled).containsExactly("👍")
    }

    @Test
    fun `un appui long sur une reaction ouvre qui a reagi sans la basculer`() {
        var who = 0
        val toggled = mutableListOf<String>()
        show(
            state(reactions = listOf(ReactionEntry("🔥", 1))),
            FocalChipsBandActions(onReactionToggle = { toggled += it }, onReactionWho = { who++ }),
        )
        compose.onNodeWithContentDescription("🔥 1").performTouchInput { longClick() }
        assertThat(who).isEqualTo(1)
        assertThat(toggled).isEmpty()
    }

    @Test
    fun `la puce de date ouvre les infos du message et le drapeau actif emet sa langue`() {
        var info = 0
        val tapped = mutableListOf<String>()
        show(
            state(flags = flags("fr", "en", active = "fr")),
            FocalChipsBandActions(onMessageInfo = { info++ }, onFlagTap = { tapped += it }),
        )
        compose.onNodeWithContentDescription("Hier 18:30").performClick()
        compose.onNodeWithContentDescription("lang-en").performClick()
        assertThat(info).isEqualTo(1)
        assertThat(tapped).containsExactly("en")
    }
}
