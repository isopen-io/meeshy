package me.meeshy.app.calls

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.material3.Text
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #18192 — sous TalkBack, le carrousel est UN élément : « suivant / précédent » (et les pas de DÉCLINAISON d'un cadre)
 * PARCOURENT sans appliquer ni refermer ; seule l'activation (double toucher) applique ce qui est annoncé. Miroir de
 * iOS #18197 (`CallModeCarouselBrowse`).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallModeCarouselTalkBackTest {
    @get:Rule val rule = createComposeRule()

    private val items = listOf("a", "b", "c", "d")
    private val declinations = mapOf("b" to listOf("b", "b.1", "b.2"))

    private fun node() = rule.onNode(hasContentDescription("Frames"))

    private fun state(): String? = node().fetchSemanticsNode().config.getOrNull(SemanticsProperties.StateDescription)

    private fun run(label: String) {
        rule.waitForIdle()
        val action = node().fetchSemanticsNode().config[SemanticsActions.CustomActions].first { it.label == label }.action
        rule.runOnIdle { action() }
    }

    private fun activate() {
        rule.waitForIdle()
        rule.runOnIdle { node().fetchSemanticsNode().config[SemanticsActions.OnClick].action!!() }
    }

    private class Spy {
        val selected = mutableListOf<String>()
        val applied = mutableListOf<String>()
        var confirmed = 0
    }

    private fun show(spy: Spy, selection: String = "b", posed: String = "b") {
        rule.setContent {
            MeeshyTheme {
                CallModeCarousel(
                    items = items,
                    selection = selection,
                    title = "Frames",
                    name = { it },
                    reduceMotion = true,
                    onSelect = { spy.selected += it },
                    nextLabel = "Next",
                    previousLabel = "Previous",
                    onConfirm = { spy.confirmed++ },
                    variants = CallModeVariants(
                        of = { declinations[it].orEmpty() },
                        current = { if (it == "b") posed else it },
                        next = "Next version",
                        previous = "Previous version",
                        pose = { spy.applied += it },
                    ),
                ) { item, _ -> Text(item) }
            }
        }
    }

    @Test
    fun `a declination step browses without applying or closing`() {
        val spy = Spy()
        show(spy)

        run("Next version")

        assertThat(spy.applied).isEmpty()
        assertThat(spy.selected).isEmpty()
        assertThat(spy.confirmed).isEqualTo(0)
        assertThat(state()).startsWith("b.1")
    }

    @Test
    fun `activating after a declination step applies the browsed declination`() {
        val spy = Spy()
        show(spy)

        run("Next version")
        activate()

        assertThat(spy.applied).containsExactly("b.1")
        assertThat(spy.selected).isEmpty()
    }

    @Test
    fun `the declination steps are only offered on a frame that has declinations`() {
        val spy = Spy()
        show(spy, selection = "a", posed = "a")

        val labels = node().fetchSemanticsNode().config[SemanticsActions.CustomActions].map { it.label }
        assertThat(labels).containsAtLeast("Next", "Previous")
        assertThat(labels).doesNotContain("Next version")
    }

    @Test
    fun `a frame step then a declination step announces the declination of the browsed frame`() {
        val spy = Spy()
        show(spy, selection = "a", posed = "a")

        run("Next")
        run("Next version")

        assertThat(state()).startsWith("b.1")
        assertThat(spy.applied).isEmpty()
        assertThat(spy.selected).isEmpty()
    }

    @Test
    fun `the spoken value carries the one based position`() {
        show(Spy(), selection = "c", posed = "c")

        assertThat(state()).isEqualTo("c, 3 of 4")
    }

    @Test
    fun `activating with nothing browsed confirms and applies nothing`() {
        val spy = Spy()
        show(spy)

        activate()

        assertThat(spy.confirmed).isEqualTo(1)
        assertThat(spy.applied).isEmpty()
        assertThat(spy.selected).isEmpty()
    }

    @Test
    fun `the plain frame is applied when a declination is posed and the step goes back to it`() {
        val spy = Spy()
        show(spy, posed = "b.1")

        run("Previous version")
        activate()

        assertThat(spy.applied).containsExactly("b")
    }
}
