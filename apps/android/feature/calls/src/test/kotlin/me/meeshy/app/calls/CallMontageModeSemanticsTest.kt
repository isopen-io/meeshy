package me.meeshy.app.calls

import android.content.Context
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.frames.CallFrameMood
import me.meeshy.sdk.model.call.montage.CallMontageMoodChip
import me.meeshy.sdk.model.call.montage.CallMontageScopeToggle
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallMontageModeSemanticsTest {
    @get:Rule val rule = createComposeRule()

    private val context: Context = ApplicationProvider.getApplicationContext()
    private val signature = CallMontageMoodChip.Mood(CallFrameMood.SIGNATURE)

    private fun isSelected(value: Boolean) = SemanticsMatcher.expectValue(SemanticsProperties.Selected, value)

    @Test
    fun `la puce choisie est annoncee selectionnee, les autres non`() {
        rule.setContent {
            MeeshyTheme {
                MoodChips(
                    chips = listOf(CallMontageMoodChip.Classics, signature),
                    selected = CallMontageMoodChip.Classics,
                    isEnabled = true,
                    toggle = null,
                    onScope = {},
                    onSelect = {},
                )
            }
        }

        rule.onNodeWithText(context.getString(R.string.call_frames_classics)).assert(isSelected(true))
        rule.onNodeWithText(context.getString(R.string.call_frames_mood_signature)).assert(isSelected(false))
    }

    @Test
    fun `toucher une autre puce la choisit, toucher la choisie ne fait rien`() {
        val picked = mutableListOf<CallMontageMoodChip>()
        rule.setContent {
            MeeshyTheme {
                MoodChips(
                    chips = listOf(CallMontageMoodChip.Classics, signature),
                    selected = CallMontageMoodChip.Classics,
                    isEnabled = true,
                    toggle = null,
                    onScope = {},
                    onSelect = { picked += it },
                )
            }
        }

        rule.onNodeWithText(context.getString(R.string.call_frames_classics)).performClick()
        rule.onNodeWithText(context.getString(R.string.call_frames_mood_signature)).performClick()

        assertThat(picked).containsExactly(signature)
    }

    @Test
    fun `l'interrupteur de portee ferme la rangee et se dit`() {
        var showsAll: Boolean? = null
        rule.setContent {
            MeeshyTheme {
                MoodChips(
                    chips = listOf(CallMontageMoodChip.Classics),
                    selected = CallMontageMoodChip.Classics,
                    isEnabled = true,
                    toggle = CallMontageScopeToggle(showsAll = false),
                    onScope = { showsAll = it },
                    onSelect = {},
                )
            }
        }

        rule.onNodeWithText(context.getString(R.string.call_frames_more)).performClick()

        assertThat(showsAll).isFalse()
    }
}
