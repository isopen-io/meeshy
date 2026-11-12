package me.meeshy.app.calls

import android.content.Context
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.frames.CallFrameMood
import me.meeshy.sdk.model.call.montage.CallMontageHold
import me.meeshy.sdk.model.call.montage.CallMontageMoodChip
import me.meeshy.sdk.model.call.montage.CallMontageScopeToggle
import me.meeshy.ui.theme.MeeshyTheme
import java.io.File
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

    private fun actionBar(isRecording: Boolean, onHold: (String) -> Unit = {}) {
        rule.setContent {
            MeeshyTheme {
                MontageActionBar(
                    hold = CallMontageHold("frame", isOn = false),
                    isRecording = isRecording,
                    facesEnabled = !isRecording,
                    onFaces = {},
                    onQuit = {},
                    onHold = onHold,
                )
            }
        }
    }

    @Test
    fun `C1_8 - pendant une prise Cadre est desactive, pas seulement sourd au toucher`() {
        val held = mutableListOf<String>()
        actionBar(isRecording = true) { held += it }

        rule.onNodeWithContentDescription(context.getString(R.string.call_live_frame_label)).assertIsNotEnabled().performClick()

        assertThat(held).isEmpty()
    }

    @Test
    fun `C1_8 - hors prise Cadre est actif et garde le cadre au toucher`() {
        val held = mutableListOf<String>()
        actionBar(isRecording = false) { held += it }

        rule.onNodeWithContentDescription(context.getString(R.string.call_live_frame_label)).assertIsEnabled().performClick()

        assertThat(held).containsExactly("frame")
    }

    private fun calls(): File = generateSequence(File("").absoluteFile) { it.parentFile }
        .flatMap { sequenceOf(File(it, "src/main/kotlin/me/meeshy/app/calls"), File(it, "feature/calls/src/main/kotlin/me/meeshy/app/calls")) }
        .first { File(it, "CallMontageCapture.kt").isFile }

    private fun code(name: String): String = File(calls(), name).readText()

    @Test
    fun `C1_12 - le Montage est toujours compose par sa couche, qui fond et fait monter la barre du bas`() {
        val screen = code("CallScreen.kt")
        val mode = code("CallMontageCapture.kt")

        assertThat(screen).doesNotContain("if (chromeState.layer.activeMode == CallScreenMode.Montage)")
        assertThat(screen).contains("visible = chromeState.layer.activeMode == CallScreenMode.Montage")
        assertThat(mode).contains("CallModeLayer(visible = visible, mode = CallScreenMode.Montage, reduceMotion = reduceMotion)")
        assertThat(mode).contains("pickerModifier = Modifier.align(Alignment.BottomCenter).then(chrome)")
    }

    @Test
    fun `C1_4 - la rangee des ambiances s'estompe a ses bords comme les autres rangees qui defilent`() {
        assertThat(code("CallFrameMoodChips.kt")).contains("callScrollEdgeFade(list, horizontal = true)")
    }
}
