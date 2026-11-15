package me.meeshy.app.game.progression

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.performSemanticsAction
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.LeagueCloses
import me.meeshy.sdk.model.game.LeagueKey
import me.meeshy.sdk.model.game.progression.ProgressionLeaguePiece
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * LE DÉTAIL DE LA JOUTE en tête de sa fiche (iOS `GameLeagueDetailCard`) : le cercle, la place et les points de la
 * semaine, la fermeture — et toute la carte qui se touche pour ouvrir la page de la joute.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr")
class LeaguePieceComposeTest {

    @get:Rule val compose = createComposeRule()

    private val piece = ProgressionLeaguePiece(LeagueKey.Jade, rank = 3, groupSize = 30, weekPoints = 120, closes = LeagueCloses("2099-01-01", 0))

    @Test
    fun `the piece says the circle, the place, the week and the closing`() {
        compose.setContent { MeeshyTheme { LeaguePiece(piece, onOpen = {}) } }

        val card = hasClickAction()
        compose.onNode(card and hasText("Jade", substring = true)).assertExists()
        compose.onNode(card and hasText("Place 3 sur 30", substring = true)).assertExists()
        compose.onNode(card and hasText("cette semaine", substring = true)).assertExists()
        compose.onNode(card and hasText("Se ferme dans", substring = true)).assertExists()
    }

    @Test
    fun `touching the piece opens the joust page`() {
        var opened = 0
        compose.setContent { MeeshyTheme { LeaguePiece(piece, onOpen = { opened++ }) } }

        compose.onNode(hasClickAction() and hasText("Place 3 sur 30", substring = true)).performSemanticsAction(SemanticsActions.OnClick)

        assertThat(opened).isEqualTo(1)
    }
}
