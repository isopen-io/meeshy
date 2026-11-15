package me.meeshy.app.auth

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.world.WorldGuestStep
import me.meeshy.ui.component.chrome.LocalPresentedAsSheet
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * L'entrée invitée « Monde » est présentée en plein écran (COVER) : à l'étape Nom, son bouton de tête ferme (✕,
 * « Fermer ») ; à l'étape Langue, il RECULE d'une étape, et il le dit (chevron, « Retour »), comme iOS.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class WorldGuestTopBarTest {

    @get:Rule
    val compose = createComposeRule()

    private fun show(step: WorldGuestStep, backLabel: String, onBack: () -> Unit = {}) {
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalPresentedAsSheet provides true) {
                    WorldGuestTopBar(step = step, backLabel = backLabel, onBack = onBack)
                }
            }
        }
    }

    @Test
    fun `a l'etape Langue le bouton de tete recule et l'annonce comme un retour`() {
        var backs = 0
        show(WorldGuestStep.LANGUAGE, backLabel = "Back", onBack = { backs += 1 })

        compose.onNodeWithContentDescription("Back").performClick()
        compose.onNodeWithContentDescription("Close").assertDoesNotExist()
        assertThat(backs).isEqualTo(1)
    }

    @Test
    fun `a l'etape Nom le bouton de tete du plein ecran ferme`() {
        show(WorldGuestStep.NAME, backLabel = "Close")

        compose.onNodeWithContentDescription("Close").assertExists()
    }
}
