package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class RouteTrackerTest {
    private fun args(vararg pairs: Pair<String, String?>): (String) -> String? = pairs.toMap()::get

    @Test
    fun `un motif se resout avec ses arguments et sans les arguments absents`() {
        val pattern = "chat/{conversationId}?messageId={messageId}"
        assertThat(RouteTracker.resolve(pattern, args("conversationId" to "42"))).isEqualTo("chat/42")
        assertThat(RouteTracker.resolve(pattern, args("conversationId" to "42", "messageId" to "m9"))).isEqualTo("chat/42?messageId=m9")
    }

    @Test
    fun `chaque changement de destination est suivi une fois`() {
        val tracked = mutableListOf<String>()
        val tracker = RouteTracker { tracked += it }
        tracker.onDestinationChanged("a", "conversations", args())
        tracker.onDestinationChanged("a", "conversations", args())
        tracker.onDestinationChanged("b", "settings", args())
        assertThat(tracked).containsExactly("conversations", "settings").inOrder()
        assertThat(tracker.current.value).isEqualTo("settings")
    }

    @Test
    fun `un retour retire du miroir tout ce qui etait au-dessus`() {
        val tracker = RouteTracker()
        tracker.onDestinationChanged("a", "conversations", args())
        tracker.onDestinationChanged("b", "settings", args())
        tracker.onDestinationChanged("c", "settings/privacy", args())
        tracker.onDestinationChanged("b", "settings", args())
        assertThat(tracker.resolvedStack).containsExactly("conversations", "settings").inOrder()
    }
}
