package me.meeshy.app.chat

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.statusBars
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.composer.ComposerDockState
import me.meeshy.sdk.model.composer.ComposerDockSurface

/** La dernière hauteur de clavier connue, gardée le temps du processus pour que le premier panneau d'une conversation la reprenne. */
private object ComposerDockMemory {
    @Volatile var lastKeyboardHeightDp: Float? = null
}

/** Le dock du composeur : une seule surface (clavier, carrousel de pièces, panneau emoji) sous la barre. */
@Stable
internal class ComposerDockController(initial: ComposerDockState) {
    var state by mutableStateOf(initial)
        private set

    val attachmentPanelOpen: Boolean get() = state.surface == ComposerDockSurface.ATTACHMENT_PANEL
    val emojiPanelOpen: Boolean get() = state.surface == ComposerDockSurface.EMOJI_PANEL

    fun fieldFocused() { state = state.fieldFocused() }
    fun keyboardHidden() { state = state.keyboardHidden() }
    fun closePanels() { if (state.isPanelOpen) state = state.closeAll() }
    fun closeAll() { state = state.closeAll() }
    fun toggleAttachmentPanel() { state = state.toggleAttachmentPanel() }
    fun openEmojiPanel() { if (!emojiPanelOpen) state = state.toggleEmojiPanel() }

    fun keyboardMeasured(heightDp: Float) {
        state = state.keyboardMeasured(heightDp)
        ComposerDockMemory.lastKeyboardHeightDp = state.lastKeyboardHeightDp
    }
}

@Composable
internal fun rememberComposerDock(keyboard: ComposerKeyboardState): ComposerDockController {
    val dock = remember { ComposerDockController(ComposerDockState(lastKeyboardHeightDp = ComposerDockMemory.lastKeyboardHeightDp)) }
    LaunchedEffect(keyboard.settledHeightDp) { keyboard.settledHeightDp?.let(dock::keyboardMeasured) }
    return dock
}

/** La hauteur du panneau de pièces : celle du clavier mémorisé, bornée par la loi, sur la fenêtre courante. */
@Composable
internal fun ComposerDockController.attachmentPanelHeight(): Dp {
    val configuration = LocalConfiguration.current
    val density = LocalDensity.current
    val safeTop = with(density) { WindowInsets.statusBars.getTop(this).toDp().value }
    val safeBottom = with(density) { WindowInsets.navigationBars.getBottom(this).toDp().value }
    return state.attachmentPanelHeight(
        configuration.screenWidthDp.toFloat(),
        configuration.screenHeightDp.toFloat(),
        safeTop,
        safeBottom,
    ).dp
}

/** Le emplacement d'un panneau : il occupe AU MOINS la hauteur du clavier, pour que la ligne de saisie ne bouge pas. */
@Composable
internal fun ComposerPanelSlot(minHeight: Dp, content: @Composable () -> Unit) {
    Box(Modifier.fillMaxWidth().heightIn(min = minHeight)) { content() }
}
