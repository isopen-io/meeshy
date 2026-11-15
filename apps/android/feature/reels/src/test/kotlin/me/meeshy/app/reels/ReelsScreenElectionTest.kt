package me.meeshy.app.reels

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.geometry.Offset
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ReelPlaybackElection
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** L'élection suit le doigt : le réel entrant est élu à la moitié de la page, et posé seulement à l'arrêt. */
@OptIn(ExperimentalFoundationApi::class)
@RunWith(RobolectricTestRunner::class)
class ReelsScreenElectionTest {

    @get:Rule
    val compose = createComposeRule()

    private val ids = listOf("a", "b", "c")
    private lateinit var pager: PagerState
    private var election: ReelPlaybackElection = ReelPlaybackElection()

    private fun setHarness() {
        compose.setContent {
            pager = rememberPagerState(pageCount = { ids.size })
            val current by rememberReelElection(pager, ids)
            election = current
            VerticalPager(state = pager, modifier = Modifier.fillMaxSize()) { Box(Modifier.fillMaxSize()) }
        }
    }

    @Test
    fun `au repos le premier reel est elu et pose`() {
        setHarness()
        compose.waitForIdle()
        assertThat(election.activeId).isEqualTo("a")
        assertThat(election.restingId).isEqualTo("a")
    }

    @Test
    fun `passer la moitie de la page elit le suivant avant le relacher sans le poser`() {
        setHarness()
        compose.waitForIdle()
        compose.onRoot().performTouchInput {
            down(center)
            repeat(6) { moveBy(Offset(0f, -height * 0.12f)) }
        }
        compose.waitForIdle()

        assertThat(election.activeId).isEqualTo("b")
        assertThat(election.restingId).isEqualTo("a")
        assertThat(election.isScrolling).isTrue()

        compose.onRoot().performTouchInput { up() }
        compose.waitForIdle()

        assertThat(election.activeId).isEqualTo("b")
        assertThat(election.restingId).isEqualTo("b")
    }
}
