package me.meeshy.app.feed

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalDensity
import me.meeshy.sdk.model.FeedReelKind
import me.meeshy.sdk.model.FeedReelVisibility

/**
 * Cette surface rapporte son cadre à l'élection du fil (iOS `reportReelFrame`), par pas de 8 dp : un cadre qui n'a pas franchi
 * un pas n'est pas republié. Elle l'oublie en quittant la composition. Hors fil, ou sans [id], aucun effet.
 */
@Composable
internal fun Modifier.reelFrame(id: String?, kind: FeedReelKind): Modifier {
    val coordinator = LocalFeedAutoplayCoordinator.current
    val density = LocalDensity.current.density
    if (coordinator == null || id == null) return this
    DisposableEffect(coordinator, id) { onDispose { coordinator.forget(id) } }
    return onGloballyPositioned { layout ->
        if (!layout.isAttached) return@onGloballyPositioned
        val top = layout.positionInWindow().y
        coordinator.report(FeedReelVisibility.reported(id, kind, top, top + layout.size.height, density))
    }
}
