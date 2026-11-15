package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import me.meeshy.sdk.model.call.frames.CallFrameMood
import me.meeshy.sdk.model.call.frames.CallFrameScope
import me.meeshy.sdk.model.call.frames.CallFrameSpotlightRule
import me.meeshy.sdk.model.call.montage.CallMontageChoice
import me.meeshy.sdk.model.call.montage.CallMontageMoodChip
import me.meeshy.sdk.model.call.montage.CallMontagePickRule
import me.meeshy.sdk.model.call.montage.CallMontageStyle
import org.junit.Test

/**
 * Le choix du mode Montage tel que le contrôleur de capture le porte (iOS `CallCaptureController.select/show`) :
 * les ambiances proposées suivent `n`, le choix est réconcilié quand `n` change, chaque ambiance garde son
 * dernier choix.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CallMontageControllerTest {

    private val duo = 2
    private val trio = 3

    private fun controller() = CallCaptureController(
        frames = mockk(relaxed = true),
        painter = mockk(relaxed = true),
        saver = mockk(relaxed = true),
        recorders = { mockk(relaxed = true) },
        scope = TestScope(),
        clock = { 0L },
        stamp = { "stamp" },
    )

    @Test
    fun `les puces commencent par Classiques puis ne listent que les ambiances qui servent n`() {
        val pick = controller().pick.value

        val chips = CallMontagePickRule.chips(pick, duo)

        assertThat(chips.first()).isEqualTo(CallMontageMoodChip.Classics)
        assertThat(chips.drop(1)).containsExactlyElementsIn(
            CallFrameSpotlightRule.moods(duo, CallFrameScope.SPOTLIGHT).map { CallMontageMoodChip.Mood(it) },
        ).inOrder()
    }

    @Test
    fun `le mode s'ouvre sur l'Ecran classique`() {
        val pick = controller().pick.value

        assertThat(CallMontagePickRule.choice(pick, duo)).isEqualTo(CallMontageChoice.Classic(CallMontageStyle.SCREEN))
    }

    @Test
    fun `chaque ambiance garde son dernier choix quand on la quitte et qu'on y revient`() {
        val capture = controller()
        val mood = CallMontageMoodChip.Mood(CallFrameMood.SIGNATURE)
        capture.show(mood, duo)
        val frames = CallFrameSpotlightRule.frames(duo, CallFrameMood.SIGNATURE, CallFrameScope.SPOTLIGHT)
        capture.select(CallMontageChoice.Frame(frames.last().id))
        capture.select(CallMontageChoice.Classic(CallMontageStyle.NEON))

        capture.show(mood, duo)

        assertThat(CallMontagePickRule.choice(capture.pick.value, duo)).isEqualTo(CallMontageChoice.Frame(frames.last().id))
        capture.show(CallMontageMoodChip.Classics, duo)
        assertThat(CallMontagePickRule.choice(capture.pick.value, duo)).isEqualTo(CallMontageChoice.Classic(CallMontageStyle.NEON))
    }

    @Test
    fun `quand n change, le choix est ramene sur un cadre qui sert les nouveaux participants`() {
        val capture = controller()
        val design = CallFrameSpotlightRule.frames(duo, CallFrameMood.SIGNATURE, CallFrameScope.ALL).first()
        capture.setScope(CallFrameScope.ALL, duo)
        capture.select(CallMontageChoice.Frame(design.id))

        val reconciled = CallMontagePickRule.choice(capture.pick.value, trio)

        assertThat(CallMontagePickRule.items(capture.pick.value, trio)).contains(CallMontagePickRule.selection(capture.pick.value, trio))
        assertThat(reconciled).isNotNull()
    }

    @Test
    fun `le cadre garde pendant l'appel devient le choix a l'ouverture`() {
        val capture = controller()
        val held = CallFrameSpotlightRule.frames(duo, CallFrameMood.SIGNATURE, CallFrameScope.SPOTLIGHT).first()

        capture.open(held.id)

        assertThat(CallMontagePickRule.choice(capture.pick.value, duo)).isEqualTo(CallMontageChoice.Frame(held.id))
    }
}
