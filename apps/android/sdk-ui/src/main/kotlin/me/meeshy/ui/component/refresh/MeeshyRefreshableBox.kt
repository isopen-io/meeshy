package me.meeshy.ui.component.refresh

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Velocity
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.chrome.PullRefreshLaw
import me.meeshy.sdk.model.chrome.PullRefreshPhase
import me.meeshy.ui.haptics.rememberMeeshyHaptics

/**
 * Tirer-pour-rafraîchir de marque (iOS `MeeshyRefreshableScroll`) : tout contenu défilant posé dans
 * [content] se tire depuis le haut ; [MeeshyPullIndicator] grandit au-dessus et la phase suit la loi
 * pure [PullRefreshLaw] (seuil 90 dp). Haptique moyenne au franchissement du seuil, puis succès ou
 * erreur, et une respiration finale avant repli. La phase n'est écrite que lorsqu'elle change.
 */
@Composable
public fun MeeshyRefreshableBox(
    onRefresh: suspend () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    content: @Composable () -> Unit,
) {
    val haptics = rememberMeeshyHaptics()
    val scope = rememberCoroutineScope()
    val density = LocalDensity.current
    val currentRefresh by rememberUpdatedState(onRefresh)
    val isEnabled by rememberUpdatedState(enabled)
    var phase by remember { mutableStateOf<PullRefreshPhase>(PullRefreshPhase.Idle) }
    var pullPx by remember { mutableStateOf(0f) }

    fun apply(distancePx: Float) {
        pullPx = distancePx.coerceAtLeast(0f)
        val next = PullRefreshLaw.next(phase, pullPx / density.density) ?: return
        if (PullRefreshLaw.crossesThreshold(phase, next)) haptics.medium()
        phase = next
    }

    fun runRefresh() {
        phase = PullRefreshPhase.Refreshing
        scope.launch {
            val failed = try {
                currentRefresh()
                false
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                true
            }
            if (failed) haptics.error() else haptics.success()
            phase = PullRefreshPhase.Completing
            delay(PullRefreshLaw.COMPLETION_BREATH_MILLIS)
            pullPx = 0f
            phase = PullRefreshPhase.Idle
        }
    }

    val connection = remember {
        object : NestedScrollConnection {
            override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
                if (!isEnabled || pullPx <= 0f || available.y >= 0f) return Offset.Zero
                val before = pullPx
                apply(before + available.y)
                return Offset(0f, pullPx - before)
            }

            override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset {
                if (!isEnabled || source != NestedScrollSource.Drag || available.y <= 0f) return Offset.Zero
                if (phase is PullRefreshPhase.Refreshing || phase is PullRefreshPhase.Completing) return Offset.Zero
                apply(pullPx + available.y)
                return Offset(0f, available.y)
            }

            override suspend fun onPreFling(available: Velocity): Velocity {
                val armed = phase is PullRefreshPhase.Armed
                if (armed) runRefresh() else if (pullPx > 0f) apply(0f)
                pullPx = 0f
                return Velocity.Zero
            }
        }
    }

    Column(modifier = modifier.nestedScroll(connection)) {
        MeeshyPullIndicator(phase = phase)
        Box(Modifier.fillMaxSize()) { content() }
    }
}
