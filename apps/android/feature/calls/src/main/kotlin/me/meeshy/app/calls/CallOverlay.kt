package me.meeshy.app.calls

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * Where on the call screen an overlay is drawn. The slot decides the geometry
 * (the screen owns it, an overlay never positions itself) and whether the slot
 * holds one overlay or a stack of them.
 *
 * A [replacing] slot shows ONE thing at a time — the highest-priority visible
 * overlay replaces the others, mirroring the iOS `CallScreenLayer` doctrine
 * (« une seule chose à la fois »). A stacking slot shows every visible overlay,
 * the highest priority first.
 */
enum class CallOverlaySlot(val replacing: Boolean) {
    /** Behind the peer block, over the video: a poster, a tint, a placeholder. */
    Background(replacing = false),

    /** Pinned under the status bar: notices that must not be missed (recording, capture…). */
    TopBanner(replacing = false),

    /** Over the peer block: what concerns the other side's picture. */
    Center(replacing = false),

    /** Above the controls, below the peer block: live captions. */
    Captions(replacing = false),

    /** Just above the controls: the returned word, the invitations that ring. */
    AboveControls(replacing = false),

    /** A panel opened from the controls (people, reactions): one at a time. */
    Panel(replacing = true),

    /** A layer that takes the whole screen (effects bar, capture preview): one at a time. */
    Fullscreen(replacing = true),
}

/** What an overlay is given to render itself: the call as the screen sees it, and the peer accent. */
data class CallOverlayContext(
    val state: CallUiState,
    /** The conversation accent of the call (convention: passed down, never recomputed). */
    val accent: Color,
)

/**
 * An extension point for the UI of a call capability. An overlay is registered
 * with `@IntoSet` in the capability's own Hilt module and appears in its [slot]
 * on the call screen — [CallScreen] is never edited to add one.
 *
 * Priority orders overlays inside a slot: the larger [priority] wins (and comes
 * first in a stacking slot, replaces the others in a replacing one). Equal
 * priorities fall back to [id], so the order never depends on registration.
 */
interface CallOverlay {
    /** Stable and unique: it keys the composition and breaks priority ties. */
    val id: String

    val slot: CallOverlaySlot

    val priority: Int get() = 0

    /** Whether the overlay has something to show for this snapshot of the call. */
    fun isVisible(state: CallUiState): Boolean = true

    @Composable
    fun Content(context: CallOverlayContext)
}
