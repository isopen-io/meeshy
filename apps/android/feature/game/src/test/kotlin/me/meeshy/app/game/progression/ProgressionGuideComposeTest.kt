package me.meeshy.app.game.progression

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import me.meeshy.sdk.model.game.guide.GameGuide
import me.meeshy.sdk.model.game.guide.GameGuideCards
import me.meeshy.sdk.model.game.guide.GuideCard
import me.meeshy.sdk.model.game.guide.GuideDestination
import me.meeshy.sdk.model.game.guide.GuideEvent
import me.meeshy.sdk.model.game.guide.GuidePresentation
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import me.meeshy.sdk.model.game.rules.OnboardingStepKey
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Mee sur la première page (iOS `ProgressionGuideLine` + `GameGuideCardView`) : la ligne courte ouvre la carte entière,
 * dont les boutons écartent la carte puis mènent à la fiche visée ; « Passer l'intégration » n'existe que pendant
 * l'intégration ; « Immortaliser ce moment » n'apparaît qu'avec un moment photo ET un atelier pour le recevoir.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr")
class ProgressionGuideComposeTest {

    @get:Rule val compose = createComposeRule()

    private fun flameOut(): GuideCard =
        GameGuideCards.of(GameGuide.moment(GuideEvent.FlameOut(lostDays = 4, relightPrice = 10, canRelight = false), emptySet()))

    @Test
    fun `la ligne dit la version courte et ouvre la carte entiere`() {
        val card = flameOut().copy(presentation = GuidePresentation.Short)
        compose.setContent { MeeshyTheme { ProgressionGuide(card, routes(), onDismiss = {}, onSkipAll = {}) } }

        compose.onNodeWithTag(GUIDE_LINE_TAG).assertIsDisplayed()
        compose.onNodeWithContentDescription("Flamme éteinte : un nouveau geste la rallume.").assertExists()
        compose.onNodeWithTag(GUIDE_CARD_TAG).assertDoesNotExist()

        compose.onNodeWithTag(GUIDE_LINE_TAG).performClick()
        compose.waitForIdle()

        compose.onNodeWithTag(GUIDE_CARD_TAG).assertExists()
        compose.onNodeWithText("Ta Flamme s’est éteinte.").assertExists()
        compose.onNodeWithText("Ton prochain geste en allume une nouvelle.").assertExists()
    }

    @Test
    fun `le bouton de la carte ecarte puis ouvre la fiche visee`() {
        val opened = mutableListOf<GuideDestination>()
        var dismissed = 0
        val card = flameOut()
        val routes = routes(opened)
        compose.setContent {
            MeeshyTheme {
                GameGuideCardView(card, onAction = { routes.act(card) { dismissed += 1 } }, onDismiss = {})
            }
        }
        compose.onNodeWithText("Rallumer la Flamme").performClick()

        assertEquals(1, dismissed)
        assertEquals(listOf<GuideDestination>(GuideDestination.Concept(ProgressionConcept.Flame)), opened)
    }

    @Test
    fun `l integration se numerote et se passe en entier`() {
        var dismissed = 0
        var skipped = 0
        var acted = 0
        val card = GameGuideCards.of(OnboardingStepKey.Welcome)
        compose.setContent {
            MeeshyTheme {
                GameGuideCardView(card, onAction = { acted += 1 }, onDismiss = { dismissed += 1 }, onSkipAll = { skipped += 1 })
            }
        }

        compose.onNodeWithText("Étape 1 sur 7").assertExists()
        compose.onNodeWithText("Salut, c’est Mee ! Avec Meo, on t’explique le jeu en sept cartes.").assertExists()
        compose.onNodeWithTag(GUIDE_PHOTO_TAG).assertDoesNotExist()
        compose.onNodeWithTag(GUIDE_MORE_TAG).assertDoesNotExist()
        compose.onNodeWithText("Faire mon premier geste").performClick()
        compose.onNodeWithText("Passer").performClick()
        compose.onNodeWithText("Passer l’intégration").performClick()

        assertEquals(Triple(1, 1, 1), Triple(acted, dismissed, skipped))
        assertEquals(GuideDestination.Conversations, card.destination)
    }

    @Test
    fun `un moment dit Plus tard sans passer l integration`() {
        compose.setContent { MeeshyTheme { GameGuideCardView(flameOut(), onAction = {}, onDismiss = {}, onSkipAll = {}) } }

        compose.onNodeWithText("Plus tard").assertExists()
        compose.onNodeWithTag(GUIDE_SKIP_ALL_TAG).assertDoesNotExist()
        compose.onNodeWithText("Passer").assertDoesNotExist()
    }

    @Test
    fun `la photo ne se propose qu avec un moment photo et un atelier`() {
        val tier = GameGuideCards.of(GameGuide.moment(GuideEvent.Level100(canPrestige = true), emptySet()))
        var photo = 0
        compose.setContent {
            MeeshyTheme {
                androidx.compose.foundation.layout.Column {
                    GameGuideCardView(tier, onAction = {}, onDismiss = {}, onPhoto = { photo += 1 })
                    GameGuideCardView(flameOut(), onAction = {}, onDismiss = {}, onPhoto = { photo += 1 })
                }
            }
        }

        compose.onNodeWithText("Immortaliser ce moment").performClick()
        assertEquals(1, photo)
        assertEquals(true, tier.photo)
        assertEquals(false, flameOut().photo)
    }

    @Test
    fun `une carte courte rouvre l explication complete`() {
        val card = flameOut().copy(presentation = GuidePresentation.Short)
        compose.setContent { MeeshyTheme { GameGuideCardView(card, onAction = {}, onDismiss = {}) } }

        compose.onNodeWithText("Ta Flamme s’est éteinte.").assertDoesNotExist()
        compose.onNodeWithTag(GUIDE_MORE_TAG).performClick()
        compose.onNodeWithText("Ta Flamme s’est éteinte.").assertExists()
    }

    private fun routes(opened: MutableList<GuideDestination> = mutableListOf()) = ProgressionGuideRoutes(
        concept = { opened += GuideDestination.Concept(it) },
        conversations = { opened += GuideDestination.Conversations },
        notebook = { opened += GuideDestination.Photo },
    )
}
