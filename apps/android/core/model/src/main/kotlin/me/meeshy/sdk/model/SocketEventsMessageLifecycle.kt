package me.meeshy.sdk.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.nullable
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject

/**
 * Le cycle de vie d'un message vu du socket (miroir de `MessageSocketEvents+Messages.swift`, iOS) : `mention:created`, le
 * champ `bridge` à trois états de `conversation:unread-updated` et la règle « modifié ». Valeurs et règles pures ;
 * `message:cited-post-withdrawn`, `message:pending-delivered` et `attachment-status:updated` sont déjà décodés par
 * [ConversationSocketEvent].
 */
object MessageLifecycleEventNames {
    const val MENTION_CREATED = "mention:created"
}

/**
 * `mention:created` : quelqu'un a mentionné ce lecteur. Tout est optionnel sauf les deux identifiants : une charge qui ne
 * nomme ni le message ni la conversation ne se décode pas, donc ne compte rien (échec fermé).
 */
@Serializable
data class MentionCreatedEvent(
    val messageId: String,
    val conversationId: String,
    val senderId: String? = null,
    val mentionedUserId: String? = null,
    val content: String? = null,
    val timestamp: String? = null,
)

/**
 * Ce que le serveur DIT du pont ✦ sur `conversation:unread-updated` : trois états, là où le fil n'a que deux formes.
 * Clé absente ≠ `bridge: null` — un silence ne détruit rien (miroir de `BridgeAnnouncement`, iOS, cycle 63).
 */
@Serializable(with = BridgeAnnouncementSerializer::class)
sealed interface BridgeAnnouncement {
    /** Clé ABSENTE (ou illisible) : le serveur n'a pas calculé le pont, on garde celui qu'on a. */
    data object NotComputed : BridgeAnnouncement

    /** `bridge: null` EXPLICITE : le serveur a calculé, il n'y a pas de pont — on efface. */
    data object Cleared : BridgeAnnouncement

    /** Un pont neuf — on remplace. */
    data class Announced(val bridge: ConversationBridge) : BridgeAnnouncement

    /** Le pont de la ligne après cette annonce. */
    fun applyTo(current: ConversationBridge?): ConversationBridge? = when (this) {
        NotComputed -> current
        Cleared -> null
        is Announced -> bridge
    }
}

object BridgeAnnouncementSerializer : KSerializer<BridgeAnnouncement> {
    /** Nullable : `coerceInputValues` ne doit pas rabattre un `null` explicite sur le défaut (absent). */
    override val descriptor: SerialDescriptor = JsonElement.serializer().nullable.descriptor

    override fun deserialize(decoder: Decoder): BridgeAnnouncement {
        val input = decoder as? JsonDecoder ?: return BridgeAnnouncement.NotComputed
        return when (val element = input.decodeJsonElement()) {
            is JsonNull -> BridgeAnnouncement.Cleared
            is JsonObject -> runCatching { input.json.decodeFromJsonElement(ConversationBridge.serializer(), element) }
                .getOrNull()?.let { BridgeAnnouncement.Announced(it) } ?: BridgeAnnouncement.NotComputed
            else -> BridgeAnnouncement.NotComputed
        }
    }

    override fun serialize(encoder: Encoder, value: BridgeAnnouncement) {
        val output = encoder as? JsonEncoder ?: return
        output.encodeJsonElement(
            when (value) {
                BridgeAnnouncement.NotComputed, BridgeAnnouncement.Cleared -> JsonNull
                is BridgeAnnouncement.Announced -> output.json.encodeToJsonElement(ConversationBridge.serializer(), value.bridge)
            },
        )
    }
}

/** Qui dit « modifié » : jamais un avis d'appel réécrit sur place par la passerelle (`callNoticeUpdated`, `marksEdited = false`). */
object MessageEditMarks {
    fun marksEdited(message: ApiMessage): Boolean = message.callSummary == null && message.isEdited
}

/**
 * Le registre des mentions non lues, par conversation : un ensemble d'identifiants de MESSAGES, donc `mention:created`
 * rejoué (reconnexion) ne compte jamais deux fois. La passerelle annonce une mention par deux voies — `mention:created`
 * et `notification:new` — : [onNotification] retient le message déjà annoncé par la seconde pour que la première ne
 * déclenche pas de seconde alerte in-app, et le badge, lui, ne dépend que des identifiants.
 */
data class MentionLedger(
    val unread: Map<String, Set<String>> = emptyMap(),
    val announced: List<String> = emptyList(),
) {
    /** Ce que [onMentionCreated] décide : le registre suivant et si une alerte in-app est due. */
    data class Outcome(val ledger: MentionLedger, val alertDue: Boolean)

    val total: Int get() = unread.values.sumOf { it.size }

    fun count(conversationId: String): Int = unread[conversationId]?.size ?: 0

    fun onMentionCreated(event: MentionCreatedEvent, viewerId: String?, conversationIsOpen: Boolean): Outcome {
        val aimedElsewhere = event.mentionedUserId != null && viewerId != null && event.mentionedUserId != viewerId
        val own = event.senderId != null && event.senderId == viewerId
        if (aimedElsewhere || own || conversationIsOpen) return Outcome(this, alertDue = false)
        val known = unread[event.conversationId].orEmpty()
        if (event.messageId in known) return Outcome(this, alertDue = false)
        val next = copy(unread = unread + (event.conversationId to (known + event.messageId)))
        return Outcome(next, alertDue = event.messageId !in announced)
    }

    /** Un `notification:new` de mention a déjà annoncé [messageId] : pas de seconde alerte. */
    fun onNotification(messageId: String): MentionLedger =
        if (messageId in announced) this else copy(announced = (announced + messageId).takeLast(ANNOUNCED_CAP))

    /** La conversation est lue : ses mentions s'effacent. */
    fun onRead(conversationId: String): MentionLedger =
        if (conversationId in unread) copy(unread = unread - conversationId) else this

    companion object {
        const val ANNOUNCED_CAP = 200
    }
}
