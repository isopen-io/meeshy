package me.meeshy.ui.component.feedback

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.feedback.FeedbackToastCenter
import me.meeshy.sdk.model.feedback.FeedbackToastInfo
import me.meeshy.sdk.model.feedback.FeedbackToastKind
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Le toast d'un refus nomme en une ligne ; sa précision vit derrière un (i) nommé par la question, lue au repos par le lecteur d'écran (#18099). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FeedbackToastInfoNoteTest {

    @get:Rule
    val compose = createComposeRule()

    private val info = FeedbackToastInfo("Cette limite touche-t-elle mes étincelles ?", "Elle compte vos gestes, jamais vos étincelles.")

    private fun host(center: FeedbackToastCenter) {
        compose.setContent { MeeshyTheme { FeedbackToastCenterHost(center) } }
    }

    @Test
    fun `le toast avec note porte un i nomme par la question, la note est lue sans etre affichee`() {
        val center = FeedbackToastCenter()
        host(center)
        center.show("Limite de réactions atteinte", FeedbackToastKind.ERROR, info = info)
        compose.waitForIdle()
        compose.onNodeWithText("Limite de réactions atteinte").assertIsDisplayed()
        val button = compose.onNodeWithContentDescription(info.question)
        button.assertIsDisplayed()
        assertThat(button.fetchSemanticsNode().config[SemanticsProperties.StateDescription]).isEqualTo(info.text)
        compose.onNodeWithText(info.text).assertDoesNotExist()
    }

    @Test
    fun `toucher le i deplie la note sous la ligne, le toucher encore la replie`() {
        val center = FeedbackToastCenter()
        host(center)
        center.show("Limite de réactions atteinte", FeedbackToastKind.ERROR, info = info)
        compose.waitForIdle()
        compose.onNodeWithContentDescription(info.question).performClick()
        compose.onNodeWithText(info.text).assertIsDisplayed()
        compose.onNodeWithContentDescription(info.question).performClick()
        compose.onNodeWithText(info.text).assertDoesNotExist()
    }

    @Test
    fun `un toast sans note n'a pas de i`() {
        val center = FeedbackToastCenter()
        host(center)
        center.show("Enregistré")
        compose.waitForIdle()
        compose.onNodeWithText("Enregistré").assertIsDisplayed()
        compose.onNodeWithContentDescription(info.question).assertDoesNotExist()
    }
}
