package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/** Les lignes que le cache Room a écrites avant l'élargissement se relisent avec les défauts. */
class ConversationLegacyPayloadTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private val legacy = """
        {"id":"c1","type":"direct","title":"Ana","unreadCount":2,"memberCount":2,
         "lastMessage":{"id":"m1","content":"salut","senderId":"u1","isBlurred":false,"isViewOnce":false},
         "lastMessageTranslations":{"fr":"salut"},"lastMessageOriginalLanguage":"en",
         "userPreferences":[{"isPinned":true,"tags":["x"],"version":4}]}
    """.trimIndent()

    @Test
    fun `un ancien payload se decode sans erreur avec les defauts`() {
        val c = json.decodeFromString(ApiConversation.serializer(), legacy)

        assertThat(c.memberCountCapped).isNull()
        assertThat(c.communityId).isNull()
        assertThat(c.bannerThumbHash).isNull()
        assertThat(c.tags).isEmpty()
        assertThat(c.recentMessages).isEmpty()
        assertThat(c.lastReaction).isNull()
        assertThat(c.activeCall).isNull()
        assertThat(c.viewerWriteRestriction).isNull()
        assertThat(c.bridge).isNull()
        assertThat(c.lastMessage?.nature).isNull()
        assertThat(c.resolvedPreferences?.orderInCategory).isNull()
        assertThat(c.resolvedPreferences?.version).isEqualTo(4)
    }

    @Test
    fun `l'aller-retour par le Json de l'application garde la ligne et n'invente aucun champ`() {
        val first = json.decodeFromString(ApiConversation.serializer(), legacy)
        val encoded = json.encodeToString(ApiConversation.serializer(), first)
        val second = json.decodeFromString(ApiConversation.serializer(), encoded)

        assertThat(second).isEqualTo(first)
        assertThat(encoded).doesNotContain("activeCall")
        assertThat(encoded).doesNotContain("bridge")
    }

    @Test
    fun `un payload complet avec cles inconnues se decode et se relit apres aller-retour`() {
        val full = """
            {"id":"c2","type":"group","futureField":{"a":1},"memberCountCapped":true,"communityId":"k",
             "tags":["t"],"listRankAt":"2026-10-01T10:00:00.000Z",
             "lastReaction":{"emoji":"x","reactorId":"p","reactorName":"Ana","messageId":"m","createdAt":"2026-10-01T10:00:00.000Z","futur":1},
             "activeCall":{"id":"call1","kind":"video","participantCount":2,"startedAt":"2026-10-01T10:00:00.000Z"},
             "bridge":{"kind":"fallback","unreadCount":3,"data":{"authors":["Ana"],"messageCount":3}}}
        """.trimIndent()
        val first = json.decodeFromString(ApiConversation.serializer(), full)
        val second = json.decodeFromString(ApiConversation.serializer(), json.encodeToString(ApiConversation.serializer(), first))

        assertThat(second).isEqualTo(first)
        assertThat(second.activeCall?.kind).isEqualTo("video")
        assertThat(second.listRankAt).isEqualTo("2026-10-01T10:00:00.000Z")
    }
}
