package me.meeshy.app.chat

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.EphemeralChoice
import me.meeshy.sdk.model.EphemeralDuration
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #13995 — le sélecteur de l'éphémère d'iOS (`ephemeralDurationPicker`, #8303) : « Désactivé »,
 * « Après lecture », puis 15 s et les durées, dans cet ordre ; un toucher arme ce choix.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr")
class ComposerEphemeralRailTest {

    @get:Rule
    val compose = createComposeRule()

    private val selectedMatcher = SemanticsMatcher.expectValue(SemanticsProperties.Selected, true)

    @Test
    fun theRailOffersOffAfterReadThenFifteenSecondsAndEveryDuration() {
        compose.setContent {
            MeeshyTheme { ComposerEphemeralRail(selected = null, accentColor = Color.Blue, onPick = {}) }
        }

        compose.onNodeWithTag(EPHEMERAL_OFF_CHIP_TAG).assert(selectedMatcher)
        compose.onNodeWithText("Désactivé").assertExists()
        compose.onNodeWithText("Après lecture").assertExists()
        EphemeralChoice.menu.forEach { compose.onNodeWithTag(ephemeralChoiceChipTag(it)).assertExists() }
        compose.onNodeWithTag("composer-ephemeral-15").assertExists()
    }

    @Test
    fun touchingAfterReadOrFifteenSecondsArmsThatChoice_andOffDisarms() {
        val picks = mutableListOf<EphemeralChoice?>()
        compose.setContent {
            var selected by remember { mutableStateOf<EphemeralChoice?>(null) }
            MeeshyTheme {
                ComposerEphemeralRail(selected = selected, accentColor = Color.Blue, onPick = { picks += it; selected = it })
            }
        }

        compose.onNodeWithTag(ephemeralChoiceChipTag(EphemeralChoice.AfterRead)).performClick()
        compose.onNodeWithTag(ephemeralChoiceChipTag(EphemeralChoice.AfterRead)).assert(selectedMatcher)
        compose.onNodeWithTag("composer-ephemeral-15").performClick()
        compose.onNodeWithTag(EPHEMERAL_OFF_CHIP_TAG).performClick()

        assertThat(picks).containsExactly(
            EphemeralChoice.AfterRead,
            EphemeralChoice.Duration(EphemeralDuration.FIFTEEN_SECONDS),
            null,
        ).inOrder()
    }

    @Test
    fun theAfterReadChipSaysWhenItDisappears_toTheScreenReader() {
        compose.setContent {
            MeeshyTheme { ComposerEphemeralRail(selected = null, accentColor = Color.Blue, onPick = {}) }
        }

        compose.onNodeWithTag(ephemeralChoiceChipTag(EphemeralChoice.AfterRead)).assert(
            SemanticsMatcher.expectValue(
                SemanticsProperties.ContentDescription,
                listOf("Après lecture, quand le lecteur quitte la conversation"),
            ),
        )
    }
}
