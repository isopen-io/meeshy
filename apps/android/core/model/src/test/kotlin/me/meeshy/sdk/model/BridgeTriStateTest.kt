package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class BridgeTriStateTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }

    private fun decode(raw: String): UnreadUpdateEvent = json.decodeFromString(UnreadUpdateEvent.serializer(), raw)

    private val held = ConversationBridge(kind = ConversationBridge.KIND_FALLBACK, unreadCount = 3)

    @Test
    fun `une cle bridge absente n'a pas ete calculee et garde le pont`() {
        val event = decode("""{"conversationId":"c1","unreadCount":2}""")
        assertThat(event.bridge).isEqualTo(BridgeAnnouncement.NotComputed)
        assertThat(event.bridge.applyTo(held)).isEqualTo(held)
    }

    @Test
    fun `bridge null explicite efface le pont`() {
        val event = decode("""{"conversationId":"c1","unreadCount":0,"bridge":null}""")
        assertThat(event.bridge).isEqualTo(BridgeAnnouncement.Cleared)
        assertThat(event.bridge.applyTo(held)).isNull()
    }

    @Test
    fun `un objet bridge remplace le pont`() {
        val event = decode("""{"conversationId":"c1","unreadCount":5,"bridge":{"kind":"agent","unreadCount":5,"text":"Resume"}}""")
        val announced = event.bridge as BridgeAnnouncement.Announced
        assertThat(announced.bridge.text).isEqualTo("Resume")
        assertThat(event.bridge.applyTo(held)).isEqualTo(announced.bridge)
    }

    @Test
    fun `un pont illisible vaut non calcule et ne detruit rien`() {
        val event = decode("""{"conversationId":"c1","unreadCount":5,"bridge":{"unreadCount":"x"}}""")
        assertThat(event.bridge).isEqualTo(BridgeAnnouncement.NotComputed)
        assertThat(event.bridge.applyTo(held)).isEqualTo(held)
    }

    @Test
    fun `un champ bridge de forme etrangere vaut non calcule`() {
        assertThat(decode("""{"conversationId":"c1","unreadCount":1,"bridge":"oops"}""").bridge)
            .isEqualTo(BridgeAnnouncement.NotComputed)
    }
}
