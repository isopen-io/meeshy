package me.meeshy.ui.component.kit

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performSemanticsAction
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * K40 — le bouton rendu : ce que le lecteur d'écran lit et ce que le maintien rapporte. Le maintien se tient par la loi du
 * bouton (miroir de `MeeshyButtonHoldLaw`, iOS), jamais par l'état que l'hôte renvoie : un hôte en retard d'une image ne fait
 * ni deux « tenu » de suite, ni un micro qui reste ouvert quand le bouton s'en va.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshyButtonBehaviorTest {

    @get:Rule
    val compose = createComposeRule()

    private val deferred = "Will be sent when you are back online"

    @Test
    fun `l'action du lecteur d'ecran tient puis relache, meme si l'hote ne renvoie pas son etat`() {
        val reports = mutableListOf<Boolean>()
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                MeeshyButton("Parler", onClick = {}, shape = MeeshyButtonShape.Hold, onHoldChange = { reports += it })
            }
        }

        compose.onNodeWithContentDescription("Parler").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithContentDescription("Parler").performSemanticsAction(SemanticsActions.OnClick)

        assertThat(reports).containsExactly(true, false).inOrder()
    }

    @Test
    fun `un maintien tenu au lecteur d'ecran se relache quand le bouton quitte l'ecran`() {
        val reports = mutableListOf<Boolean>()
        var shown by mutableStateOf(true)
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                if (shown) MeeshyButton("Parler", onClick = {}, shape = MeeshyButtonShape.Hold, onHoldChange = { reports += it })
            }
        }

        compose.onNodeWithContentDescription("Parler").performSemanticsAction(SemanticsActions.OnClick)
        shown = false
        compose.waitForIdle()

        assertThat(reports).containsExactly(true, false).inOrder()
    }

    @Test
    fun `un maintien eteint n'offre aucune action au lecteur d'ecran`() {
        val reports = mutableListOf<Boolean>()
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                MeeshyButton("Parler", onClick = {}, shape = MeeshyButtonShape.Hold, enabled = false, onHoldChange = { reports += it })
            }
        }

        val node = compose.onNodeWithContentDescription("Parler").fetchSemanticsNode()

        assertThat(node.config.getOrNull(SemanticsActions.OnClick)).isNull()
        assertThat(reports).isEmpty()
    }

    @Test
    fun `l'horloge d'un bouton differe se dit une fois, dans le nom du bouton, et n'est pas un arret de plus`() {
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                MeeshyButton("Envoyer", onClick = {}, isDeferred = true)
            }
        }

        compose.onAllNodesWithContentDescription(deferred).assertCountEquals(0)
        val button = compose.onNodeWithContentDescription("Envoyer", substring = true).fetchSemanticsNode()
        assertThat(button.config.getOrNull(SemanticsProperties.ContentDescription)).containsExactly("Envoyer, $deferred")
    }
}
