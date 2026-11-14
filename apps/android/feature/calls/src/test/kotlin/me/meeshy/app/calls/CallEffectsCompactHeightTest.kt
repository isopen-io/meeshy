package me.meeshy.app.calls

import android.graphics.Bitmap
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.effects.CallEffectKind
import me.meeshy.sdk.model.call.effects.CallEffectLayer
import me.meeshy.sdk.model.call.effects.CallEffectLayers
import me.meeshy.sdk.model.call.effects.CallEffectsBarMode
import me.meeshy.sdk.model.call.effects.CallEffectsGenreRule
import me.meeshy.sdk.model.call.frames.CallFrameMood
import me.meeshy.sdk.model.call.montage.CallCaptureLook
import me.meeshy.sdk.model.call.montage.CallCaptureScene
import me.meeshy.sdk.model.call.montage.CallCaptureSceneRule
import me.meeshy.sdk.model.call.montage.CallMontageMoodChip
import me.meeshy.sdk.model.call.montage.CallMontageStyle
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.CallSocialSignalManager
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #17927 · #16979 · C1 généralisée — à toute hauteur compacte (téléphone en paysage ≈ 360 dp, iPhone SE en paysage 320 dp,
 * fenêtre basse 300 dp) avec un cadre choisi, la barre `‹ · Réglages · (+)` reste ENTIÈREMENT dans l'écran et touchable
 * (48 dp) : ce qui est au-dessus (sous-titres, option « Cadre », ambiances, carrousel) se resserre ou défile, jamais la
 * barre. L'appui long sur (+) y ouvre encore la liste des couches. Le Montage s'ouvre sur son carrousel : c'est le cas le
 * plus haut.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallEffectsCompactHeightTest {
    @get:Rule val rule = createComposeRule()

    private class NoImages : CallCaptureFrameSource {
        override fun attach(id: String, track: org.webrtc.VideoTrack?) = Unit
        override fun detachAll() = Unit
        override suspend fun snapshot(subjects: List<me.meeshy.sdk.model.call.montage.CallCaptureSubject>, maxDimension: Int?): Map<String, Bitmap> = emptyMap()
    }

    private fun live(): CallLiveFrameController {
        val social = mockk<CallSocialSignalManager> {
            every { frameSelected } returns MutableSharedFlow()
            coEvery { selectCallLiveFrame(any(), any(), any(), any()) } returns Result.success(Unit)
        }
        val session = mockk<SessionRepository> { every { currentUser } returns MutableStateFlow<MeeshyUser?>(null) }
        return CallLiveFrameController(social, session).also {
            it.onTransition(CallState.Idle, CallState.Connected, CallSessionInfo("call-1", CallConfig.EMPTY))
        }
    }

    private fun capture() = CallCaptureController(
        frames = NoImages(),
        painter = { _, _, _, _ -> null },
        saver = mockk(relaxed = true),
        recorders = { mockk(relaxed = true) },
        scope = CoroutineScope(Dispatchers.Unconfined),
        clock = { 0L },
        stamp = { "STAMP" },
    )

    private fun showMontageWithAFrame() {
        val controller = live()
        val capture = capture().also { it.show(CallMontageMoodChip.Mood(CallFrameMood.SIGNATURE), 2) }
        val people = controller.people("Bob", null)
        val scene = CallCaptureScene(CallCaptureLook.Classic(CallMontageStyle.SCREEN), CallCaptureSceneRule.duo(people, true, true, false))
        val frame = CallEffectLayer(CallEffectKind.Frame, CallFrameLayer.chosen(capture.pick.value, 2)!!)
        rule.setContent {
            MeeshyTheme {
                CallMontagePicker(
                    live = controller,
                    capture = capture,
                    scene = scene,
                    people = people,
                    isLiveOffered = true,
                    reduceMotion = true,
                    onClose = {},
                    layers = CallEffectLayers.of(listOf(frame)),
                    effectsOffered = true,
                )
            }
        }
    }

    private fun assertBarWhole(description: String) {
        val button = rule.onNodeWithContentDescription(description)
        button.assertExists()
        val root = rule.onRoot().fetchSemanticsNode().boundsInRoot
        val node = button.fetchSemanticsNode().boundsInRoot
        with(rule.density) {
            assertThat(node.height.toDp().value).isAtLeast(47.5f)
            assertThat(node.width.toDp().value).isAtLeast(47.5f)
        }
        assertThat(node.top).isAtLeast(root.top - 0.5f)
        assertThat(node.bottom).isAtMost(root.bottom + 0.5f)
    }

    private fun assertWholeBarAndLongPress() {
        listOf("Back to the call", "Settings", "Add another look").forEach(::assertBarWhole)
        rule.onNodeWithContentDescription("Add another look").performTouchInput { longClick() }
        rule.waitForIdle()
        rule.onNodeWithText("Applied effects").assertExists()
    }

    @Test
    @Config(qualifiers = "w640dp-h360dp-land")
    fun `Montage, telephone en paysage 360 dp - la barre reste entiere et (+) ouvre la liste par appui long`() {
        showMontageWithAFrame()
        assertWholeBarAndLongPress()
    }

    @Test
    @Config(qualifiers = "w568dp-h320dp-land")
    fun `Montage, 568 x 320 - la barre reste entiere et (+) ouvre la liste par appui long`() {
        showMontageWithAFrame()
        assertWholeBarAndLongPress()
    }

    @Test
    @Config(qualifiers = "w640dp-h260dp-land")
    fun `Montage, fenetre tres basse - la barre reste entiere`() {
        showMontageWithAFrame()
        listOf("Back to the call", "Settings", "Add another look").forEach(::assertBarWhole)
    }

    @Test
    @Config(qualifiers = "w568dp-h320dp-land")
    fun `Effets - un dessus plus haut que l'ecran defile, la barre reste entiere`() {
        rule.setContent {
            MeeshyTheme {
                Box(Modifier.fillMaxSize()) {
                    Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                        EffectsAbove { Box(Modifier.fillMaxWidth().height(600.dp)) }
                        EffectsBar(
                            chips = CallEffectsGenreRule.row(offersEffects = true, offersFrames = true),
                            selected = CallEffectKind.Frame,
                            bar = CallEffectsBarMode.Looks,
                            layers = CallEffectLayers.of(listOf(CallEffectLayer(CallEffectKind.Frame, "frame-1"))),
                            reduceMotion = true,
                            onBack = {},
                            onSettings = {},
                            onAddLook = {},
                            onShowApplied = {},
                            onChip = {},
                        )
                    }
                }
            }
        }
        assertWholeBarAndLongPress()
    }

    @Test
    fun `les deux hotes de la barre posent leur dessus dans EffectsAbove, la barre en dernier et hors du defilement`() {
        val dir = generateSequence(File("").absoluteFile) { it.parentFile }
            .map { File(it, "src/main/kotlin/me/meeshy/app/calls") }
            .first { File(it, "CallEffectsBar.kt").isFile }
        val picker = File(dir, "CallMontagePicker.kt").readText().substringAfter("internal fun CallMontagePicker(").substringBefore("private fun MontageHoldOption(")
        val effects = File(dir, "CallEffectsMode.kt").readText().substringAfter("private fun EffectsControls(").substringBefore("internal fun EffectsModeBar(")
        listOf(picker to "EffectsBar(", effects to "EffectsModeBar(").forEach { (host, bar) ->
            assertThat(host).contains("EffectsAbove {")
            assertThat(host.indexOf("EffectsAbove {")).isLessThan(host.indexOf(bar))
        }
        assertThat(File(dir, "CallEffectsBar.kt").readText()).contains("weight(1f, fill = false)")
    }
}
