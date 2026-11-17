package me.meeshy.ui.component.kit

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.junit4.createComposeRule
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
 * K53 — le pas-à-pas rendu, au lecteur d'écran : un réglage avance d'un PAS de la loi (pas de base, échelle de pas, bornes),
 * jamais d'un vingtième de la plage, et la plage annoncée compte ses crans.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshyStepperBehaviorTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `la plage annoncee compte un cran par pas`() {
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                MeeshyStepper(value = 4, range = 0..10, label = "Rayon", onChange = {}, step = 2)
            }
        }

        val info = compose.onNodeWithContentDescription("Rayon").fetchSemanticsNode().config[SemanticsProperties.ProgressBarRangeInfo]

        assertThat(info.steps).isEqualTo(4)
    }

    @Test
    fun `un reglage au lecteur d'ecran avance d'un pas de l'echelle, pas jusqu'a la valeur demandee`() {
        val changes = mutableListOf<Int>()
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                MeeshyStepper(
                    value = 20, range = 0..100, label = "Quota", onChange = { changes += it },
                    stepLadder = listOf(MeeshyStepperRung(from = 20, step = 10)),
                )
            }
        }

        compose.onNodeWithContentDescription("Quota").performSemanticsAction(SemanticsActions.SetProgress) { it(25f) }
        compose.onNodeWithContentDescription("Quota").performSemanticsAction(SemanticsActions.SetProgress) { it(15f) }

        assertThat(changes).containsExactly(30, 10).inOrder()
    }

    @Test
    fun `un reglage au lecteur d'ecran contre la butee previent l'hote et ne change rien`() {
        val changes = mutableListOf<Int>()
        var bounds = 0
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                MeeshyStepper(value = 10, range = 0..10, label = "Rayon", onChange = { changes += it }, onBound = { bounds++ })
            }
        }

        compose.onNodeWithContentDescription("Rayon").performSemanticsAction(SemanticsActions.SetProgress) { it(11f) }

        assertThat(changes).isEmpty()
        assertThat(bounds).isEqualTo(1)
    }
}
