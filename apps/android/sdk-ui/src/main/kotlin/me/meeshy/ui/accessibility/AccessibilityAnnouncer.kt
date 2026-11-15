package me.meeshy.ui.accessibility

import android.content.Context
import android.view.View
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityManager

public enum class AnnouncementPriority { POLITE, ASSERTIVE }

public fun interface AnnouncementSink {
    public fun announce(text: String, priority: AnnouncementPriority)
}

/** Annonces TalkBack : ne fait rien tant qu'aucun lecteur d'écran n'est actif ; une erreur est assertive. */
public class AccessibilityAnnouncer(
    private val isScreenReaderActive: () -> Boolean,
    private val sink: AnnouncementSink,
) {
    public fun announce(text: String, priority: AnnouncementPriority = AnnouncementPriority.POLITE) {
        if (text.isBlank() || !isScreenReaderActive()) return
        sink.announce(text, priority)
    }

    public fun announceError(text: String) {
        announce(text, AnnouncementPriority.ASSERTIVE)
    }

    public companion object {
        public fun forView(view: View): AccessibilityAnnouncer {
            val manager = view.context.getSystemService(Context.ACCESSIBILITY_SERVICE) as? AccessibilityManager
            return AccessibilityAnnouncer(
                isScreenReaderActive = { manager?.isEnabled == true && manager.isTouchExplorationEnabled },
                sink = { text, priority ->
                    when (priority) {
                        AnnouncementPriority.POLITE -> view.announceForAccessibility(text)
                        AnnouncementPriority.ASSERTIVE -> {
                            @Suppress("DEPRECATION")
                            val event = AccessibilityEvent.obtain(AccessibilityEvent.TYPE_ANNOUNCEMENT)
                            event.text.add(text)
                            event.className = view.javaClass.name
                            event.packageName = view.context.packageName
                            manager?.sendAccessibilityEvent(event)
                        }
                    }
                },
            )
        }
    }
}
