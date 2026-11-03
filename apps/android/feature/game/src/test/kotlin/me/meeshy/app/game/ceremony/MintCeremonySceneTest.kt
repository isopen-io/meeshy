package me.meeshy.app.game.ceremony

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.MeeshEdition
import me.meeshy.sdk.model.game.ceremony.MintCeremonyAnswer
import me.meeshy.sdk.model.game.ceremony.GameMintCeremony
import me.meeshy.sdk.model.game.ceremony.MintCeremonyChoreography
import me.meeshy.sdk.model.game.ceremony.MintCeremonyMode
import me.meeshy.sdk.model.game.ceremony.MintCeremonyParticles
import me.meeshy.sdk.model.game.ceremony.MintCeremonyPaint
import me.meeshy.sdk.model.game.ceremony.MintCeremonyRequest
import me.meeshy.sdk.model.game.ceremony.MintCeremonyRun
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr")
class MintCeremonySceneTest {

    @get:Rule val compose = createComposeRule()

    private val words = MintCeremonyWords("lumière", "TCHAK !", "TCHAK !!", "Les aïeux", "Ils frappaient", "Mee dit", "+12")

    private fun started(edition: MeeshEdition = MeeshEdition.Gold, modest: Boolean = false): MintCeremonyRun =
        MintCeremonyRun.start(MintCeremonyRequest(92, edition, settled = null), reduced = false, modest = modest, prepared = null)
            .receive(MintCeremonyAnswer.Confirmed(92), atMs = 0.0)

    private fun paintAt(run: MintCeremonyRun, seconds: Double, stride: Int = 1): MintCeremonyPaint =
        run.particles.paint(run.plan(seconds * 1000), seconds, stride)

    private fun renderAt(run: MintCeremonyRun, times: List<Double>) {
        var seconds by mutableDoubleStateOf(times.first())
        compose.setContent {
            val plan = run.plan(seconds * 1000)
            MeeshyTheme {
                Box(Modifier.size(360.dp, 640.dp)) {
                    MintCeremonyScene(
                        MintCeremonyChoreography.frame(plan, seconds), paintAt(run, seconds), run.edition, run.look, 92, 2026, false, words,
                        Modifier.fillMaxSize(),
                    )
                }
            }
        }
        times.forEach {
            seconds = it
            compose.waitForIdle()
            assertThat(paintAt(run, it).painted).isAtMost(MintCeremonyBudget.MAX_PARTICLES)
            assertThat(paintAt(run, it).batches.size).isAtMost(MAX_BATCHES)
        }
    }

    @Test
    fun `the scene renders at 0, 0_45, 2_2 and 4_8 seconds without crashing`() {
        renderAt(started(), listOf(0.0, 0.45, 2.2, 4.8))
    }

    @Test
    fun `a refusal renders the shadow and the returning sparks without crashing`() {
        val refused = MintCeremonyRun.start(MintCeremonyRequest(92, MeeshEdition.Prism, settled = null), reduced = false, modest = false, prepared = null)
            .receive(MintCeremonyAnswer.Refused("TREASURY_LOCKED"), atMs = 2_000.0)
        renderAt(refused, listOf(2.0, 2.4, 3.0))
    }

    private fun paintOf(modest: Boolean, stride: Int): MintCeremonyPaint {
        val plan = GameMintCeremony.plan(MeeshEdition.Prism, MintCeremonyMode.Normal, modest = modest)
        return MintCeremonyParticles.build(plan, seed = 1000).paint(plan, 2.7, stride)
    }

    @Test
    fun `particles stay within the budget and stride 2 halves them`() {
        val full = paintOf(modest = false, stride = 1)
        assertThat(full.painted).isAtMost(MintCeremonyBudget.MAX_PARTICLES)
        assertThat(paintOf(modest = false, stride = 2).painted).isLessThan(full.painted)
    }

    @Test
    fun `a modest device paints fewer particles than a mid-range one`() {
        assertThat(paintOf(modest = true, stride = 1).painted).isLessThan(paintOf(modest = false, stride = 1).painted)
    }

    private companion object {
        const val MAX_BATCHES = 1_000
    }
}
