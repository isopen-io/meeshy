package me.meeshy.app.profile

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Le chiffrement de bout en bout est un repère propre à Meeshy (règle 7 de l'épure #17584) : la fiche d'une
 * personne dit, VISIBLE au repos, que ses échanges peuvent être chiffrés — l'en-tête de la fiche ne le dit pas,
 * et « À propos » ne s'ouvre jamais vide sur ce seul signe (#18083).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "en-w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ProfileAboutE2eeBadgeTest {

    @get:Rule
    val compose = createComposeRule()

    private fun about(hasE2EE: Boolean) = ProfileAboutPresentation(
        bio = null,
        languages = emptyList(),
        timezone = null,
        country = null,
        hasE2EE = hasE2EE,
        completionPercent = null,
    )

    @Test
    fun `a person with a published identity key reads end to end encryption at rest`() {
        compose.setContent { MeeshyTheme { ProfileAboutSection(about(hasE2EE = true), MeeshyTheme.tokens.success) } }

        compose.onNodeWithText("End-to-end encryption enabled").assertIsDisplayed()
    }

    @Test
    fun `without a key nothing claims encryption`() {
        compose.setContent { MeeshyTheme { ProfileAboutSection(about(hasE2EE = false), MeeshyTheme.tokens.success) } }

        compose.onNodeWithText("End-to-end encryption enabled").assertDoesNotExist()
    }
}
