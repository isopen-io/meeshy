package me.meeshy.ui.component.audio

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.R
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MiniAudioPlayerBarSemanticsTest {
    @get:Rule val compose = createComposeRule()

    private class Taps {
        var toggles = 0
        var nexts = 0
        var closes = 0
        var opens = 0
    }

    private val taps = Taps()
    private val model = MiniAudioPlayerBarModel(
        senderName = "Awa",
        senderAvatarUrl = null,
        conversationName = "Famille",
        avatarColor = Color(0xFF6366F1),
    )

    private fun str(id: Int, vararg args: Any) =
        ApplicationProvider.getApplicationContext<android.content.Context>().getString(id, *args)

    private var shownModel by mutableStateOf<MiniAudioPlayerBarModel?>(model)
    private var playing by mutableStateOf(true)
    private var fraction by mutableFloatStateOf(0.42f)

    private fun show() {
        compose.setContent {
            MiniAudioPlayerBar(
                model = shownModel,
                isLastBar = true,
                isPlaying = playing,
                progress = { fraction },
                onTogglePlay = { taps.toggles += 1 },
                onNext = { taps.nexts += 1 },
                onClose = { taps.closes += 1 },
                onOpen = { taps.opens += 1 },
            )
        }
        compose.waitForIdle()
    }

    private fun bodyLabel() = str(R.string.mini_player_a11y_now_playing, "Awa", "Famille")

    @Test
    fun `le corps est un seul bouton qui annonce la lecture, le pourcentage et le geste`() {
        show()
        val node = compose.onNodeWithContentDescription(bodyLabel()).fetchSemanticsNode()

        assertThat(node.config.getOrNull(SemanticsProperties.Role)).isEqualTo(Role.Button)
        assertThat(node.config.getOrNull(SemanticsProperties.StateDescription)).isNotNull()
        assertThat(node.config.getOrNull(SemanticsProperties.StateDescription)).contains("42")
        compose.onNodeWithContentDescription(bodyLabel()).performClick()
        assertThat(taps.opens).isEqualTo(1)
    }

    @Test
    fun `le corps n'expose ni le nom ni la conversation comme des noeuds separes`() {
        show()
        compose.onAllNodesWithContentDescription("Awa").assertCountEquals(0)
        compose.onAllNodesWithContentDescription("Famille").assertCountEquals(0)
    }

    @Test
    fun `le pourcentage suit la progression sans que la barre soit recomposee`() {
        show()
        fraction = 0.9f
        compose.waitForIdle()

        val node = compose.onNodeWithContentDescription(bodyLabel()).fetchSemanticsNode()
        assertThat(node.config.getOrNull(SemanticsProperties.StateDescription)).contains("90")
    }

    @Test
    fun `lecture pause suivant et fermer mesurent au moins 48 dp et appellent leur action`() {
        show()
        compose.onNodeWithContentDescription(str(R.string.mini_player_pause))
            .assertWidthIsAtLeast(48.dp).assertHeightIsAtLeast(48.dp).performClick()
        compose.onNodeWithContentDescription(str(R.string.mini_player_next))
            .assertWidthIsAtLeast(48.dp).assertHeightIsAtLeast(48.dp).performClick()
        compose.onNodeWithContentDescription(str(R.string.mini_player_close))
            .assertWidthIsAtLeast(48.dp).assertHeightIsAtLeast(48.dp).performClick()

        assertThat(taps.toggles).isEqualTo(1)
        assertThat(taps.nexts).isEqualTo(1)
        assertThat(taps.closes).isEqualTo(1)
        assertThat(taps.opens).isEqualTo(0)
    }

    @Test
    fun `le bouton montre Lecture quand le vocal est en pause`() {
        playing = false
        show()

        compose.onNodeWithContentDescription(str(R.string.mini_player_play)).assertWidthIsAtLeast(48.dp)
        compose.onAllNodesWithContentDescription(str(R.string.mini_player_pause)).assertCountEquals(0)
    }

    @Test
    fun `sans modele la barre ne monte aucun noeud`() {
        shownModel = null
        show()

        compose.onAllNodesWithContentDescription(str(R.string.mini_player_close)).assertCountEquals(0)
        compose.onAllNodesWithContentDescription(bodyLabel()).assertCountEquals(0)
    }
}
