package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationListScreenNoStripTest {
    @Test
    fun `la bande statique de connexion n'existe plus dans la liste`() {
        val strip = runCatching { Class.forName("me.meeshy.app.conversations.ConversationConnectionBannerStripKt") }
        assertThat(strip.isFailure).isTrue()
    }

    @Test
    fun `les etats du bandeau restent le sous-ensemble que la pastille globale consomme`() {
        assertThat(ConnectionBanner.values().map { it.name })
            .containsAtLeast("HIDDEN", "SYNCING", "RECONNECTING", "OFFLINE")
    }
}
