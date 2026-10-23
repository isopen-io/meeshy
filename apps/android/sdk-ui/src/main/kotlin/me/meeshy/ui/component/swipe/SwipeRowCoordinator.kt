package me.meeshy.ui.component.swipe

import androidx.compose.runtime.staticCompositionLocalOf
import me.meeshy.sdk.model.chrome.SwipeRowFrame
import me.meeshy.sdk.model.chrome.SwipeRowLaw

/**
 * Une seule ligne glissee reste ouverte a la fois, et elle revient en place des qu'on touche ailleurs
 * (iOS `SwipeRowCoordinator`). Etat tenu HORS de Compose : ouvrir ou refermer ne recompose aucune autre ligne.
 */
public class SwipeRowCoordinator {
    private var openRowId: Any? = null
    private var closeOpenRowAction: (() -> Unit)? = null
    private var openRowFrame: SwipeRowFrame? = null

    public val hasOpenRow: Boolean get() = openRowId != null

    public fun rowDidOpen(id: Any, close: () -> Unit) {
        val current = openRowId
        if (current != null && current != id) closeOpenRowAction?.invoke()
        openRowId = id
        closeOpenRowAction = close
        openRowFrame = null
    }

    public fun rowFrameDidChange(id: Any, frame: SwipeRowFrame) {
        if (openRowId == id) openRowFrame = frame
    }

    public fun rowDidClose(id: Any) {
        if (openRowId == id) forget()
    }

    public fun closeOpenRow() {
        val close = closeOpenRowAction
        forget()
        close?.invoke()
    }

    /** Observe le debut d'un toucher de la fenetre ; ne consomme rien. */
    public fun touchBegan(x: Float, y: Float) {
        if (!hasOpenRow || !SwipeRowLaw.closesOpenRow(x, y, openRowFrame)) return
        closeOpenRow()
    }

    private fun forget() {
        openRowId = null
        closeOpenRowAction = null
        openRowFrame = null
    }

    public companion object {
        public val shared: SwipeRowCoordinator = SwipeRowCoordinator()
    }
}

public val LocalSwipeRowCoordinator = staticCompositionLocalOf { SwipeRowCoordinator.shared }
