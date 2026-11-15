package me.meeshy.ui.component.swipe

import android.view.MotionEvent
import android.view.Window
import java.util.WeakHashMap

/**
 * Observe le debut de chaque toucher de la fenetre sans en retenir, annuler ni retarder aucun :
 * l'evenement est toujours rendu tel quel a la fenetre d'origine (iOS `OutsideTouchObserver`).
 */
internal object SwipeWindowTouchObserver {
    private val hubs = WeakHashMap<Window, Hub>()

    fun register(window: Window, onTouchDown: (Float, Float) -> Unit): () -> Unit {
        val hub = hubs.getOrPut(window) { Hub(window.callback).also { window.callback = it } }
        hub.listeners += onTouchDown
        return {
            hub.listeners -= onTouchDown
            if (hub.listeners.isEmpty()) release(window, hub)
        }
    }

    private fun release(window: Window, hub: Hub) {
        if (window.callback === hub) window.callback = hub.original
        hubs.remove(window)
    }

    private class Hub(
        val original: Window.Callback,
    ) : Window.Callback by original {
        val listeners = mutableListOf<(Float, Float) -> Unit>()

        override fun dispatchTouchEvent(event: MotionEvent): Boolean {
            if (event.actionMasked == MotionEvent.ACTION_DOWN) {
                listeners.toList().forEach { runCatching { it(event.x, event.y) } }
            }
            return original.dispatchTouchEvent(event)
        }
    }
}
