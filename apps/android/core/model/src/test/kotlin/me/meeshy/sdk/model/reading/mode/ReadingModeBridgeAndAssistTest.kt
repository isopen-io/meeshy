package me.meeshy.sdk.model.reading.mode

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.coroutines.runBlocking
import me.meeshy.sdk.model.ConversationBridge
import me.meeshy.sdk.model.ConversationBridgeData
import me.meeshy.sdk.model.reading.ReadingVectors
import org.junit.Test

class ReadingModeBridgeAndAssistTest {

    @Test
    fun `chaque vecteur de la cascade d assistance est rejoue a l identique`() {
        val vectors = ReadingVectors.load("assist-tier.vectors.json")
        assertThat(vectors).isNotEmpty()
        vectors.forEach { v ->
            val i = v.input
            val tier = AssistTierResolver.resolve(
                AssistTierInput(
                    deviceCapability = i.getValue("deviceCapability").jsonPrimitive.booleanOrNull!!,
                    encryptionMode = ReadingEncryptionMode.fromWire(i["encryptionMode"]?.takeIf { it !is JsonNull }?.jsonPrimitive?.content),
                    userConsent = i.getValue("userConsent").jsonPrimitive.booleanOrNull!!,
                    conversationType = ReadingModeConversationType.of(i.getValue("conversationType").jsonPrimitive.content),
                ),
            )
            assertWithMessage(v.label).that(tier.wire).isEqualTo(v.expected.jsonPrimitive.content)
        }
    }

    @Test
    fun `aucun appareil n est jamais capable aujourd hui`() {
        assertThat(AssistCapabilityProbing.NEVER_CAPABLE.probe(ReadingModeConversationType.GROUP)).isFalse()
    }

    @Test
    fun `chaque vecteur du pont deterministe est rejoue a l identique`() {
        val vectors = ReadingVectors.load("bridge.vectors.json")
        assertThat(vectors).isNotEmpty()
        vectors.forEach { v ->
            val i = v.input
            val messages = i.getValue("messages").jsonArray.map { m ->
                val o = m.jsonObject
                BridgeMessage(
                    senderId = o.getValue("senderId").jsonPrimitive.content,
                    senderName = o.getValue("senderName").jsonPrimitive.content,
                    attachments = o["attachments"]?.jsonArray.orEmpty().map { BridgeAttachment(it.jsonObject.getValue("type").jsonPrimitive.content) },
                )
            }
            val data = ConversationBridgeFormatter.buildBridgeData(
                messages, i.getValue("viewerId").jsonPrimitive.content, i.getValue("unreadCount").jsonPrimitive.int,
            )
            val expected = v.expected
            if (expected is JsonNull) {
                assertWithMessage(v.label).that(data).isNull()
            } else {
                val e = expected.jsonObject
                assertThat(data).isNotNull()
                assertThat(data!!.authors).containsExactlyElementsIn(e.getValue("authors").jsonArray.map { it.jsonPrimitive.content }).inOrder()
                assertThat(data.extraAuthorCount).isEqualTo(e.getValue("extraAuthorCount").jsonPrimitive.int)
                assertThat(data.messageCount).isEqualTo(e.getValue("messageCount").jsonPrimitive.int)
                val mc = e["mediaCounts"] as? JsonObject
                assertThat(data.mediaCounts?.images).isEqualTo(mc?.get("images")?.jsonPrimitive?.int)
                assertThat(data.mediaCounts?.audio).isEqualTo(mc?.get("audio")?.jsonPrimitive?.int)
                assertThat(data.mediaCounts?.files).isEqualTo(mc?.get("files")?.jsonPrimitive?.int)
                assertThat(data.mediaCounts == null).isEqualTo(mc == null)
            }
        }
    }

    private val echo: BridgeTranslate = { key, params -> "$key${params.entries.sortedBy { it.key }.joinToString(",", "[", "]") { "${it.key}=${it.value}" }}" }

    @Test
    fun `la phrase du pont compose auteurs messages et medias avec la traduction injectee`() {
        val data = ConversationBridgeData(
            authors = listOf("Alice", "Bob"),
            extraAuthorCount = 2,
            messageCount = 1,
            mediaCounts = me.meeshy.sdk.model.ConversationBridgeMediaCounts(images = 2, audio = 0, files = null),
        )
        assertThat(ConversationBridgeFormatter.formatBridge(data, echo)).isEqualTo(
            "lentille.bridge.authorsMore[a=Alice,b=Bob,count=2] · lentille.bridge.messagesOne[count=1] · lentille.bridge.media.images[count=2]",
        )
    }

    @Test
    fun `la mode suggere est focal sous le plafond et resume au dela`() {
        assertThat(ConversationBridgeFormatter.suggestedMode(25)).isEqualTo(ConversationBridge.MODE_FOCAL)
        assertThat(ConversationBridgeFormatter.suggestedMode(26)).isEqualTo(ConversationBridge.MODE_RESUME)
    }

    @Test
    fun `le texte d agent se resout par le prisme du lecteur et retombe sur l original`() {
        val bridge = ConversationBridge(
            kind = ConversationBridge.KIND_AGENT, unreadCount = 3, text = "Hello", originalLanguage = "en",
            translations = mapOf("fr" to "Bonjour"),
        )
        assertThat(ConversationBridgeFormatter.resolveAgentText(bridge, listOf("fr", "en"))).isEqualTo("Bonjour")
        assertThat(ConversationBridgeFormatter.resolveAgentText(bridge, listOf("en", "fr"))).isEqualTo("Hello")
        assertThat(ConversationBridgeFormatter.resolveAgentText(bridge, listOf("de"))).isEqualTo("Hello")
    }

    @Test
    fun `une ligne d agent sans preuve n existe pas et le fournisseur nul ne rend rien`() = runBlocking {
        assertThat(AgentBridgeLine.of("x", emptyList())).isNull()
        assertThat(AgentBridgeLine.of("x", listOf("m1"))!!.evidenceMessageIds).containsExactly("m1")
        assertThat(NullAgentAssistProvider.bridge("c")).isNull()
        assertThat(NullAgentAssistProvider.suggestions("c", "m")).isEmpty()
        assertThat(NullAgentAssistProvider.shortcuts("c", "m")).isEmpty()
        assertThat(NullAgentAssistProvider.episodeTitles("c", emptyList())).isEmpty()
    }

    @Test
    fun `deux invites sur le meme appareil ont chacun leur cle et un inscrit utilise u_id`() {
        val a = ConversationViewerIdentity.resolve("p1", "u9")
        val b = ConversationViewerIdentity.resolve("p2", null)
        assertThat(a.isAnonymous).isTrue()
        assertThat(a.scope.storageKey).matches("a_[0-9a-f]{16}")
        assertThat(a.scope.storageKey).isNotEqualTo(b.scope.storageKey)
        assertThat(ConversationViewerIdentity.resolve(null, "u9").scope.storageKey).isEqualTo("u_u9")
        assertThat(ConversationViewerIdentity.resolve(null, null).isAnonymous).isTrue()
    }

    @Test
    fun `chaque mode declare un hote de badge et de combustion`() {
        ConversationReadingMode.entries.forEach {
            assertThat(ReadingModeProtectionChrome.rendererPath(it)).endsWith(".kt")
            assertThat(ReadingModeProtectionChrome.burnHostPath(it)).endsWith(".kt")
        }
    }
}
