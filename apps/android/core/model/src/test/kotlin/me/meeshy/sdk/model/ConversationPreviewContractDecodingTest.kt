package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.preview.ConversationActiveCall
import me.meeshy.sdk.model.preview.ConversationLastReaction
import org.junit.Test

class ConversationPreviewContractDecodingTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private fun lastMessage(raw: String) =
        checkNotNull(json.decodeFromString(ApiConversationLastMessage.serializer(), raw))

    @Test
    fun `un appel termine expose son resume`() {
        val nature = checkNotNull(
            lastMessage(
                """{"id":"m","messageType":"system","callSummary":{"callId":"k","kind":"video","outcome":"missed",
                   "durationSec":0,"initiatorId":"u2","endedByInitiator":true}}""",
            ).nature,
        )

        assertThat(nature.callSummary?.outcome).isEqualTo("missed")
        assertThat(nature.callSummary?.endedByInitiator).isTrue()
        assertThat(nature.callSummary?.initiatorId).isEqualTo("u2")
    }

    @Test
    fun `un resultat d'appel inconnu est garde tel quel`() {
        val call = lastMessage("""{"callSummary":{"callId":"k","kind":"hologram","outcome":"teleported","initiatorId":"u"}}""")
            .callSummary

        assertThat(call?.outcome).isEqualTo("teleported")
        assertThat(call?.kind).isEqualTo("hologram")
    }

    @Test
    fun `le resume des pieces compte par famille et la taille totale peut manquer`() {
        val summary = lastMessage(
            """{"attachmentSummary":{"count":3,"kinds":{"image":2,"audio":1},"totalSize":1048576}}""",
        ).attachmentSummary
        val noSize = lastMessage("""{"attachmentSummary":{"count":1,"kinds":{"file":1}}}""").attachmentSummary

        assertThat(summary?.count).isEqualTo(3)
        assertThat(summary?.kinds).containsExactly("image", 2, "audio", 1)
        assertThat(summary?.totalSize).isEqualTo(1048576L)
        assertThat(noSize?.totalSize).isNull()
    }

    @Test
    fun `un evenement systeme porte une cle et des parametres texte ou nombre`() {
        val event = lastMessage(
            """{"systemEvent":{"key":"system.member-added","params":{"actor":"Ana","count":2.0}}}""",
        ).systemEvent

        assertThat(event?.key).isEqualTo("system.member-added")
        assertThat(event?.params?.getValue("count")?.rendered).isEqualTo("2")
        assertThat(event?.params?.getValue("actor")?.rendered).isEqualTo("Ana")
    }

    @Test
    fun `un evenement systeme sans parametres se decode avec une carte vide`() {
        assertThat(lastMessage("""{"systemEvent":{"key":"system.x"}}""").systemEvent?.params).isEmpty()
    }

    @Test
    fun `la nature est vide quand le fil ne dit rien et non vide des qu'un drapeau parle`() {
        assertThat(lastMessage("""{"id":"m","content":"a"}""").nature).isNull()
        assertThat(lastMessage("""{"isEncrypted":true}""").nature?.isEncrypted).isTrue()
        assertThat(lastMessage("""{"isForwarded":true}""").nature?.isForwarded).isTrue()
        assertThat(lastMessage("""{"ephemeralDuration":30,"effectFlags":4}""").nature?.ephemeralDuration).isEqualTo(30)
    }

    @Test
    fun `une reaction se decode avec son extrait protege`() {
        val r = json.decodeFromString(
            ConversationLastReaction.serializer(),
            """{"emoji":"x","reactorId":"p1","reactorUserId":"u1","reactorName":"Ana","messageId":"m",
               "targetSenderUserId":"u9","excerpt":null,"excerptProtection":"view-once",
               "excerptTranslations":{"fr":"salut"},"createdAt":"2026-10-01T10:00:00.000Z"}""",
        )

        assertThat(r.excerptProtection).isEqualTo("view-once")
        assertThat(r.excerpt).isNull()
        assertThat(r.targets("u9")).isTrue()
        assertThat(r.targets("")).isFalse()
        assertThat(r.targets("u1")).isFalse()
    }

    @Test
    fun `un appel actif se decode`() {
        val call = json.decodeFromString(
            ConversationActiveCall.serializer(),
            """{"id":"c","kind":"audio","participantCount":3,"startedAt":"2026-10-01T10:00:00.000Z"}""",
        )

        assertThat(call.participantCount).isEqualTo(3)
    }

    @Test
    fun `replacingSystemEvent garde le reste de la nature`() {
        val nature = LastMessageNature(messageType = "system", isForwarded = true)
        val replaced = nature.replacingSystemEvent(me.meeshy.sdk.model.preview.LastMessageSystemEvent("system.k"))

        assertThat(replaced.systemEvent?.key).isEqualTo("system.k")
        assertThat(replaced.isForwarded).isTrue()
        assertThat(replaced.isEmpty).isFalse()
    }
}
