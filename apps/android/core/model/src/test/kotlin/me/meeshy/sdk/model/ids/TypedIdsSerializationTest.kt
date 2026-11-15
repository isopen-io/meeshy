package me.meeshy.sdk.model.ids

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Test

class TypedIdsSerializationTest {
    private val json = Json

    @Test
    fun `chaque identifiant s'encode comme une simple chaine`() {
        assertThat(json.encodeToString(ConversationId("c1"))).isEqualTo("\"c1\"")
        assertThat(json.encodeToString(UserId("u1"))).isEqualTo("\"u1\"")
        assertThat(json.encodeToString(MessageId("m1"))).isEqualTo("\"m1\"")
        assertThat(json.encodeToString(PostId("p1"))).isEqualTo("\"p1\"")
        assertThat(json.encodeToString(StoryId("s1"))).isEqualTo("\"s1\"")
    }

    @Test
    fun `une chaine du fil se decode en identifiant`() {
        assertThat(json.decodeFromString<MessageId>("\"abc\"")).isEqualTo(MessageId("abc"))
    }

    @Serializable
    private data class Typed(val id: ConversationId, val author: UserId)

    @Serializable
    private data class Plain(val id: String, val author: String)

    @Test
    fun `un objet porteur garde le format du fil`() {
        val typed = json.encodeToString(Typed(ConversationId("c"), UserId("u")))
        assertThat(typed).isEqualTo(json.encodeToString(Plain("c", "u")))
        assertThat(json.decodeFromString<Typed>(typed)).isEqualTo(Typed(ConversationId("c"), UserId("u")))
    }

    @Test
    fun `toString rend la valeur brute`() {
        assertThat(PostId("p9").toString()).isEqualTo("p9")
    }
}
