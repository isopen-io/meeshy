package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class ShareLinkInfoDecodingTest {
    private val json = Json { ignoreUnknownKeys = true }

    private fun decode(raw: String) = json.decodeFromString(ShareLinkInfo.serializer(), raw)

    @Test
    fun `passerelle recente - droits expiration conversation et stats complets`() {
        val info = decode(
            """{"id":"1","linkId":"mshy_abc","expiresAt":"2026-10-30T12:00:00.000Z","maxUses":10,"currentUses":3,
            "allowAnonymousMessages":false,"allowAnonymousImages":false,"allowAnonymousFiles":true,"allowViewHistory":false,
            "conversation":{"id":"c","title":"T","type":"group","avatar":"a.png","banner":"b.png"},
            "creator":{"id":"u","username":"ada","firstName":"Ada","lastName":"L"},
            "stats":{"totalParticipants":5,"memberCount":4,"anonymousCount":1,"languageCount":2,"spokenLanguages":["fr","en"]}}""",
        )
        assertThat(info.guestRights).isEqualTo(ShareLinkGuestRights(messages = false, images = false, files = true, history = false))
        assertThat(info.expiresAt).isEqualTo(1_793_361_600_000L)
        assertThat(info.conversation?.avatar).isEqualTo("a.png")
        assertThat(info.conversation?.banner).isEqualTo("b.png")
        assertThat(info.stats?.spokenLanguages).containsExactly("fr", "en").inOrder()
        assertThat(info.stats?.totalParticipants).isEqualTo(5)
        assertThat(info.creator?.name).isEqualTo("Ada L")
    }

    @Test
    fun `passerelle ancienne - champs absents resolus par les defauts du schema`() {
        val info = decode("""{"id":"1","linkId":"mshy_abc"}""")
        assertThat(info.guestRights).isEqualTo(ShareLinkGuestRights(messages = true, images = true, files = false, history = true))
        assertThat(info.expiresAt).isNull()
        assertThat(info.currentUses).isEqualTo(0)
        assertThat(info.allowedLanguages).isEmpty()
        assertThat(info.stats).isNull()
    }

    @Test
    fun `expiration illisible se lit sans echeance sans faire echouer le document`() {
        assertThat(decode("""{"id":"1","linkId":"x","expiresAt":"demain"}""").expiresAt).isNull()
    }

    @Test
    fun `adresse canonique est chat linkId jamais le slug ni le token`() {
        val info = decode("""{"id":"1","linkId":"mshy_abc","name":"slug"}""")
        assertThat(info.address.path).isEqualTo("/chat/mshy_abc")
        assertThat(info.address.absoluteString()).isEqualTo("https://meeshy.me/chat/mshy_abc")
        assertThat(info.address.displayString()).isEqualTo("meeshy.me/chat/mshy_abc")
    }

    @Test
    fun `nom du createur - displayName puis prenom nom puis pseudo`() {
        assertThat(ShareLinkCreator(username = "u", firstName = "A", lastName = "B", displayName = "Dn").name).isEqualTo("Dn")
        assertThat(ShareLinkCreator(username = "u", firstName = "A", lastName = "B").name).isEqualTo("A B")
        assertThat(ShareLinkCreator(username = "u", firstName = "A").name).isEqualTo("A")
        assertThat(ShareLinkCreator(username = "pseudo").name).isEqualTo("pseudo")
    }

    @Test
    fun `stats servies neutres ou omises se decodent a zero`() {
        val info = decode("""{"id":"1","linkId":"x","stats":{}}""")
        assertThat(info.stats).isEqualTo(ShareLinkStats())
    }
}
