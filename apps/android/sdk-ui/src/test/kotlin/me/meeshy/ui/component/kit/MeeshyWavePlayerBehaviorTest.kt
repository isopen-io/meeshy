package me.meeshy.ui.component.kit

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.performTouchInput
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * K35 — le lecteur d'onde rendu : le glissement se FERME toujours (miroir de la revue iOS du lot #18866). Un lecteur qui
 * cesse d'accepter le geste, ou qui quitte l'écran, sous le doigt, ne laisse pas l'hôte croire le glissement en cours ; et
 * l'onde réglable porte le nom du vocal pour TalkBack.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshyWavePlayerBehaviorTest {

    @get:Rule
    val compose = createComposeRule()

    private val wave = SemanticsMatcher.keyIsDefined(SemanticsProperties.ProgressBarRangeInfo)

    @Test
    fun `un glissement se ferme quand le lecteur quitte l'ecran sous le doigt`() {
        val reports = mutableListOf<Boolean>()
        val seeks = mutableListOf<Double>()
        var shown by mutableStateOf(true)
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                if (shown) {
                    MeeshyWavePlayer(
                        samples = List(40) { 0.5f }, progress = 0.2, isPlaying = false, label = "Vocal", onToggle = {},
                        durationSeconds = 9.0, onSeek = { seeks += it }, onScrubbingChange = { reports += it },
                    )
                }
            }
        }

        compose.onNode(wave).performTouchInput { down(center); moveBy(Offset(20f, 0f)) }
        shown = false
        compose.waitForIdle()

        assertThat(reports).containsExactly(true, false).inOrder()
        assertThat(seeks).isEmpty()
    }

    @Test
    fun `un glissement se ferme des que le lecteur devient indisponible, sans rien remettre`() {
        val reports = mutableListOf<Boolean>()
        val seeks = mutableListOf<Double>()
        var phase by mutableStateOf(MeeshyWavePlayerPhase.Ready)
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                MeeshyWavePlayer(
                    samples = List(40) { 0.5f }, progress = 0.2, isPlaying = false, label = "Vocal", onToggle = {},
                    durationSeconds = 9.0, phase = phase, onSeek = { seeks += it }, onScrubbingChange = { reports += it },
                )
            }
        }

        compose.onNode(wave).performTouchInput { down(center); moveBy(Offset(20f, 0f)) }
        phase = MeeshyWavePlayerPhase.Unavailable
        compose.waitForIdle()

        assertThat(reports).containsExactly(true, false).inOrder()
        assertThat(seeks).isEmpty()
    }

    @Test
    fun `l'onde reglable porte le nom du vocal pour le lecteur d'ecran`() {
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                MeeshyWavePlayer(
                    samples = emptyList(), progress = 0.0, isPlaying = false, label = "Vocal de Léa", onToggle = {},
                    durationSeconds = 9.0, onSeek = {},
                )
            }
        }

        val node = compose.onNode(wave).fetchSemanticsNode()

        assertThat(node.config.getOrNull(SemanticsProperties.ContentDescription)).containsExactly("Vocal de Léa")
    }
}
