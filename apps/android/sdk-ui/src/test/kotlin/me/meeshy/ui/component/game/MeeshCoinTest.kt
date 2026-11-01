package me.meeshy.ui.component.game

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.game.MeeshCoinFace
import me.meeshy.sdk.model.game.MeeshEdition
import me.meeshy.ui.accessibility.LocalReduceMotion
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * La Meesh dessinée (iOS `MeeshCoinView`) : les éclats du prisme scintillent à l'écran, et seulement là — jamais sous
 * « réduire les animations », jamais hors écran, jamais sur l'argent ni l'or, qui n'en portent pas. Les trois faces des
 * trois éditions se dessinent ; la pièce est décorative sauf si l'hôte la libelle.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshCoinTest {

    @get:Rule val rule = createComposeRule()

    private fun twinkling(value: Boolean) = SemanticsMatcher.expectValue(MeeshCoinTwinkling, value)

    private fun show(edition: MeeshEdition, reduceMotion: Boolean = false, face: MeeshCoinFace = MeeshCoinFace.Obverse, farBelow: Boolean = false) {
        rule.setContent {
            CompositionLocalProvider(LocalReduceMotion provides reduceMotion) {
                Box(Modifier.size(120.dp)) {
                    MeeshCoin(Modifier.size(80.dp).offset(y = if (farBelow) 20_000.dp else 0.dp), face = face, edition = edition)
                }
            }
        }
    }

    @Test
    fun `les eclats du prisme scintillent a l'ecran`() {
        show(MeeshEdition.Prism)
        rule.onNode(twinkling(true)).assertExists()
    }

    @Test
    fun `sous reduire les animations les eclats restent immobiles`() {
        show(MeeshEdition.Prism, reduceMotion = true)
        rule.onNode(twinkling(false)).assertExists()
    }

    @Test
    fun `hors ecran les eclats restent immobiles`() {
        show(MeeshEdition.Prism, farBelow = true)
        rule.onNode(twinkling(false)).assertExists()
    }

    @Test
    fun `l'argent et l'or n'ont pas d'eclats a faire scintiller`() {
        show(MeeshEdition.Gold)
        rule.onNode(twinkling(false)).assertExists()
    }

    @Test
    fun `les trois faces des trois editions se dessinent`() {
        val faces = listOf(MeeshCoinFace.Blank, MeeshCoinFace.Obverse, MeeshCoinFace.Reverse(number = 1000, year = 2026))
        rule.setContent {
            CompositionLocalProvider(LocalReduceMotion provides true) {
                Column {
                    MeeshEdition.entries.forEach { edition ->
                        faces.forEach { face -> MeeshCoin(Modifier.size(48.dp), face = face, edition = edition) }
                    }
                }
            }
        }
        rule.onAllNodes(SemanticsMatcher.keyIsDefined(MeeshCoinEditionKey)).assertCountEquals(9)
    }

    @Test
    fun `libellee par l'hote, la piece devient un seul element image`() {
        rule.setContent { MeeshCoin(Modifier.size(64.dp), contentDescription = "Meesh n° 13") }
        rule.onNodeWithContentDescription("Meesh n° 13").assertExists()
    }
}
