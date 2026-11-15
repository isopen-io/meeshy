package me.meeshy.ui.component.audio

import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.SemanticsMatcher
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AudioConsentNoticeSemanticsTest {
    @get:Rule
    val compose = createComposeRule()

    private fun show(taps: MutableList<Unit> = mutableListOf()) {
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                AudioConsentNotice(
                    message = "Enable voice consent",
                    actionTitle = "Enable in Settings",
                    accentHex = "6366F1",
                    onTap = { taps += Unit },
                )
            }
        }
    }

    @Test
    fun `the description groups the message then the action in one node`() {
        assertThat(audioConsentNoticeDescription("Enable voice consent", "Enable in Settings"))
            .isEqualTo("Enable voice consent. Enable in Settings")
        show()

        compose.onNodeWithTag(AUDIO_CONSENT_NOTICE_TAG)
            .assert(hasContentDescription("Enable voice consent. Enable in Settings"))
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button))
    }

    @Test
    fun `the inner texts and icons are not separate accessibility stops`() {
        show()

        compose.onAllNodes(hasText("Enable in Settings")).assertCountEquals(0)
        compose.onAllNodes(hasTestTag(AUDIO_CONSENT_NOTICE_TAG)).assertCountEquals(1)
    }

    @Test
    fun `a tap on the note runs the action`() {
        val taps = mutableListOf<Unit>()
        show(taps)

        compose.onNodeWithTag(AUDIO_CONSENT_NOTICE_TAG).performClick()

        assertThat(taps).hasSize(1)
    }
}
