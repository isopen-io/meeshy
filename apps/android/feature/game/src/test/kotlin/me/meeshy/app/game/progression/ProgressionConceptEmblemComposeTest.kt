package me.meeshy.app.game.progression

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Là où l'écran montrait un pictogramme sur disque teinté, il pose l'emblème DESSINÉ d'iOS (marque, Flamme, coffre,
 * gemme, coupe, tampon). L'emblème reste décoratif : seul son repère de test le désigne.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ProgressionConceptEmblemComposeTest {

    @get:Rule val compose = createComposeRule()

    private fun assertDrawn(concept: ProgressionConcept, tag: String) {
        compose.setContent { MeeshyTheme { ProgressionConceptEmblem(concept = concept, game = null) } }
        compose.onNodeWithTag("$EMBLEM_TAG_PREFIX$tag").assertExists()
        compose.onNodeWithTag("${EMBLEM_TAG_PREFIX}pictogram").assertDoesNotExist()
    }

    @Test fun `les points posent leur jeton dessine`() = assertDrawn(ProgressionConcept.Points, "mark")

    @Test fun `les elans posent leur panneau dessine`() = assertDrawn(ProgressionConcept.Elans, "mark")

    @Test fun `la flamme pose la Flamme dessinee`() = assertDrawn(ProgressionConcept.Flame, "flame")

    @Test fun `les missions posent le coffre`() = assertDrawn(ProgressionConcept.Missions, "chest")

    @Test fun `la ligue pose la gemme`() = assertDrawn(ProgressionConcept.League, "gem")

    @Test fun `la saison pose la coupe`() = assertDrawn(ProgressionConcept.Season, "cup")

    @Test fun `l atlas pose le tampon`() = assertDrawn(ProgressionConcept.Atlas, "stamp")

    @Test fun `le niveau sans jeu pose la Signature`() = assertDrawn(ProgressionConcept.Level, "signature")
}
