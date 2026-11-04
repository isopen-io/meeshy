package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * #15984 — le contour que la passerelle sert sur chaque participant de la liste (`profileDecor`, miroir d'iOS
 * `ConversationParticipantRingTests`) se décode, sans jamais empêcher la conversation de s'ouvrir : absent d'un
 * ancien serveur ou d'une vieille ligne Room, illisible, ou relu après un tour par le cache.
 */
class ApiParticipantProfileDecorDecodingTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private val perle = ServedProfileDecorItem(pack = "contours-essentiels", item = "perle", origin = PackOrigin.BUILTIN)

    private fun conversation(peerDecor: String?): String {
        val decor = peerDecor?.let { ""","profileDecor":$it""" }.orEmpty()
        return """
            {"id":"c1","type":"direct","participants":[
              {"id":"p1","userId":"me","displayName":"Moi"},
              {"id":"p2","userId":"ali","displayName":"Ali"$decor}
            ]}
        """.trimIndent()
    }

    private fun peer(raw: String) = json.decodeFromString(ApiConversation.serializer(), raw).participants[1]

    @Test
    fun `un contour servi se decode`() {
        val decor = """{"avatarRing":{"pack":"contours-essentiels","item":"perle","origin":"builtin"}}"""

        assertThat(peer(conversation(decor)).profileDecor?.avatarRing).isEqualTo(perle)
    }

    @Test
    fun `un ancien serveur sans profileDecor ne sert aucun contour`() {
        assertThat(peer(conversation(null)).profileDecor).isNull()
    }

    @Test
    fun `une vieille ligne Room sans la cle se relit sans contour`() {
        val ligneRoom = """{"id":"c1","type":"direct","participants":[{"id":"p2","userId":"ali","displayName":"Ali"}]}"""

        assertThat(peer("""{"id":"c1","type":"direct","participants":[{"id":"p1"},{"id":"p2"}]}""").profileDecor).isNull()
        assertThat(json.decodeFromString(ApiConversation.serializer(), ligneRoom).participants.single().profileDecor).isNull()
    }

    @Test
    fun `un decor illisible ne donne aucun contour et la conversation se decode quand meme`() {
        listOf("\"pas un objet\"", "42", """{"avatarRing":"x"}""", """{"avatarRing":{"pack":1}}""").forEach { illisible ->
            val decoded = json.decodeFromString(ApiConversation.serializer(), conversation(illisible))

            assertThat(decoded.id).isEqualTo("c1")
            assertThat(decoded.participants.map { it.id }).containsExactly("p1", "p2").inOrder()
            assertThat(decoded.participants[1].displayName).isEqualTo("Ali")
            assertThat(decoded.participants[1].profileDecor?.avatarRing).isNull()
        }
    }

    @Test
    fun `le contour survit au tour par le cache`() {
        val servie = json.decodeFromString(
            ApiConversation.serializer(),
            conversation("""{"avatarRing":{"pack":"contours-essentiels","item":"perle","origin":"builtin"}}"""),
        )

        val relue = json.decodeFromString(ApiConversation.serializer(), json.encodeToString(ApiConversation.serializer(), servie))

        assertThat(relue.participants[1].profileDecor?.avatarRing).isEqualTo(perle)
    }
}
