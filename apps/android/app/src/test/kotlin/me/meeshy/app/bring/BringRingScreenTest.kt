package me.meeshy.app.bring

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.relation.BringRingTexts
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** L'écran plein du Bring (iso `BringRingView.swift`) : qui sonne, pourquoi, et UN geste pour arrêter. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], qualifiers = "fr")
class BringRingScreenTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `l ecran dit qui sonne et arrete d un seul geste`() {
        var stops = 0
        compose.setContent {
            MeeshyTheme {
                BringRingScreen(
                    texts = BringRingTexts("Alice vous fait sonner", "Un Bring : un appel pour une urgence extrême.", "Arrêter"),
                    onStop = { stops += 1 },
                )
            }
        }

        compose.onNodeWithText("Alice vous fait sonner").assertIsDisplayed()
        compose.onNodeWithText("Un Bring : un appel pour une urgence extrême.").assertIsDisplayed()
        compose.onNodeWithText("Arrêter").performClick()

        assertThat(stops).isEqualTo(1)
    }
}
