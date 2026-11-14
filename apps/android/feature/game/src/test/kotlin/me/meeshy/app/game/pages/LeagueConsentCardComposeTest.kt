package me.meeshy.app.game.pages

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import android.content.Context
import me.meeshy.feature.game.R
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** La carte de consentement de la joute publique : les phrases du consentement restent visibles, « comment suis-je placé » est derrière un (i). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr")
class LeagueConsentCardComposeTest {

    @get:Rule val compose = createComposeRule()

    private val context: Context = ApplicationProvider.getApplicationContext()

    private fun show() {
        compose.setContent { MeeshyTheme { ConsentCard(LeagueUiState(), offline = false, onAccept = {}) } }
        compose.waitForIdle()
    }

    @Test
    fun `les phrases du consentement restent visibles au repos`() {
        show()
        listOf(
            R.string.game2_league_consent_shown, R.string.game2_league_consent_who, R.string.game2_league_consent_risk,
            R.string.game2_league_consent_withdraw_info, R.string.game2_league_pseudonym_drawn,
        ).forEach { compose.onNodeWithText(context.getString(it)).assertExists() }
    }

    @Test
    fun `comment je suis place est derriere un i nomme par la question, la phrase reste lue`() {
        show()
        compose.onNodeWithText(context.getString(R.string.game2_league_consent_how)).assertDoesNotExist()
        val info = compose.onNodeWithContentDescription(context.getString(R.string.game2_league_consent_how_question))
        assertThat(info.fetchSemanticsNode().config[SemanticsProperties.StateDescription])
            .isEqualTo(context.getString(R.string.game2_league_consent_how))
        info.performClick()
        compose.onNodeWithText(context.getString(R.string.game2_league_consent_how)).assertExists()
    }
}
