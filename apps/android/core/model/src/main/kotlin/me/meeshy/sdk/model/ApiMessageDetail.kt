package me.meeshy.sdk.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import me.meeshy.sdk.model.auth.TolerantStringSerializer
import me.meeshy.sdk.model.serialization.LossyListSerializer
import me.meeshy.sdk.model.serialization.LossyNullableListSerializer
import me.meeshy.sdk.model.serialization.TolerantSerializer

/** A mentioned user attached to a message or post — port of MentionedUser (UserDisplayNameCache.swift). */
@Serializable
data class MentionedUser(
    val userId: String,
    val username: String = "",
    val displayName: String? = null,
    val avatar: String? = null,
)

/** Offset-based pagination metadata — port of OffsetPagination (APIClient.swift). */
@Serializable
data class OffsetPagination(
    val total: Int? = null,
    val hasMore: Boolean? = null,
    val limit: Int? = null,
    val offset: Int? = null,
)

/** Cursor-based pagination metadata — port of CursorPagination (APIClient.swift). */
@Serializable
data class CursorPagination(
    val nextCursor: String? = null,
    val hasMore: Boolean? = null,
    val limit: Int? = null,
)

/**
 * A transcription segment as decoded from the socket/API — port of TranscriptionSegment
 * (`MessageSocketEvents+Media.swift`). [startTime]/[endTime] are SECONDS; the gateway serves
 * milliseconds (`startMs`/`endMs`, `packages/shared/types/attachment-transcription.ts`), which win
 * when present, each bound falling back on its own seconds key — exactly iOS `init(from:)`. It
 * encodes seconds only, so a cached segment decodes back through the fallback.
 */
@Serializable(with = TranscriptionSegmentSerializer::class)
data class TranscriptionSegment(
    val text: String = "",
    val startTime: Double? = null,
    val endTime: Double? = null,
    val speakerId: String? = null,
    val voiceSimilarityScore: Double? = null,
)

@Serializable
@SerialName("TranscriptionSegment")
private data class TranscriptionSegmentWire(
    val text: String = "",
    val startMs: Double? = null,
    val endMs: Double? = null,
    val startTime: Double? = null,
    val endTime: Double? = null,
    val speakerId: String? = null,
    val voiceSimilarityScore: Double? = null,
)

internal object TranscriptionSegmentSerializer : KSerializer<TranscriptionSegment> {
    private val wire = TranscriptionSegmentWire.serializer()

    override val descriptor: SerialDescriptor = wire.descriptor

    override fun deserialize(decoder: Decoder): TranscriptionSegment {
        val served = decoder.decodeSerializableValue(wire)
        return TranscriptionSegment(
            text = served.text,
            startTime = served.startMs?.let { it / 1000.0 } ?: served.startTime,
            endTime = served.endMs?.let { it / 1000.0 } ?: served.endTime,
            speakerId = served.speakerId,
            voiceSimilarityScore = served.voiceSimilarityScore,
        )
    }

    override fun serialize(encoder: Encoder, value: TranscriptionSegment) {
        encoder.encodeSerializableValue(
            wire,
            TranscriptionSegmentWire(
                text = value.text,
                startTime = value.startTime,
                endTime = value.endTime,
                speakerId = value.speakerId,
                voiceSimilarityScore = value.voiceSimilarityScore,
            ),
        )
    }
}

/** Nested user inside a message sender — port of APIMessageSenderUser (MessageModels.swift). */
@Serializable
data class ApiMessageSenderUser(
    val id: String? = null,
    val username: String? = null,
    val displayName: String? = null,
    val firstName: String? = null,
    val lastName: String? = null,
    val avatar: String? = null,
)

/** Attachment transcription payload — port of APIAttachmentTranscription (MessageModels.swift). */
@Serializable
data class ApiAttachmentTranscription(
    val text: String? = null,
    val transcribedText: String? = null,
    val language: String? = null,
    val confidence: Double? = null,
    val durationMs: Int? = null,
    val segments: List<TranscriptionSegment>? = null,
    val speakerCount: Int? = null,
)

/** Attachment translation payload — port of APIAttachmentTranslation (MessageModels.swift). */
@Serializable
data class ApiAttachmentTranslation(
    val type: String? = null,
    val transcription: String? = null,
    val url: String? = null,
    val durationMs: Int? = null,
    val format: String? = null,
    val cloned: Boolean? = null,
    val quality: Double? = null,
    val voiceModelId: String? = null,
    val ttsModel: String? = null,
    val segments: List<TranscriptionSegment>? = null,
    /** Horodatage SERVI de la piste (`AttachmentTranslation.createdAt` / `updatedAt`) : il départage deux versions d'une même langue. */
    @Serializable(with = TolerantStringSerializer::class)
    val createdAt: String? = null,
    @Serializable(with = TolerantStringSerializer::class)
    val updatedAt: String? = null,
)

/** The message a forward originates from — port of APIForwardedFrom (MessageModels.swift). */
@Serializable
data class ApiForwardedFrom(
    val id: String,
    val content: String? = null,
    val messageType: String? = null,
    val createdAt: String? = null,
    @Serializable(with = TolerantMessageSenderSerializer::class)
    val sender: ApiMessageSender? = null,
    @Serializable(with = LossyApiMessageAttachmentListOrNullSerializer::class)
    val attachments: List<ApiMessageAttachment>? = null,
)

/** The conversation a forward originates from — port of APIForwardedFromConversation (MessageModels.swift). */
@Serializable
data class ApiForwardedFromConversation(
    val id: String,
    val title: String? = null,
    val identifier: String? = null,
    val type: String? = null,
    val avatar: String? = null,
)

/** Meta block on a messages list response — port of MessagesAPIMeta (MessageModels.swift). */
@Serializable
data class MessagesApiMeta(
    val userLanguage: String? = null,
    val mentionedUsers: List<MentionedUser>? = null,
)

/** The messages list API response — port of MessagesAPIResponse (MessageModels.swift). */
@Serializable
data class MessagesApiResponse(
    val success: Boolean = false,
    val data: List<ApiMessage> = emptyList(),
    val pagination: OffsetPagination? = null,
    val cursorPagination: CursorPagination? = null,
    val hasNewer: Boolean? = null,
    val meta: MessagesApiMeta? = null,
)

/** The data payload echoed back after sending a message — port of SendMessageResponseData (MessageModels.swift). */
@Serializable
data class SendMessageResponseData(
    val id: String,
    val clientMessageId: String? = null,
    val conversationId: String = "",
    val senderId: String? = null,
    val content: String? = null,
    val messageType: String? = null,
    val createdAt: String? = null,
)

/** Result of consuming a view-once message — port of ConsumeViewOnceResponse (MessageModels.swift). */
@Serializable
data class ConsumeViewOnceResponse(
    val messageId: String,
    val viewOnceCount: Int = 0,
    val maxViewOnceCount: Int = 0,
    val isFullyConsumed: Boolean = false,
)

// ── Sérialiseurs tolérants des messages : un champ malformé ne coûte que lui-même ──

internal object TolerantMessageSenderSerializer :
    KSerializer<ApiMessageSender?> by TolerantSerializer(ApiMessageSender.serializer())

/** Liste de traductions : une traduction malformée est écartée, les autres restent, dans l'ordre. */
object LossyApiTextTranslationListSerializer :
    KSerializer<List<ApiTextTranslation>> by LossyListSerializer(ApiTextTranslation.serializer())

object LossyApiTextTranslationListOrNullSerializer :
    KSerializer<List<ApiTextTranslation>?> by LossyNullableListSerializer(ApiTextTranslation.serializer())

object LossyMentionedUserListOrNullSerializer :
    KSerializer<List<MentionedUser>?> by LossyNullableListSerializer(MentionedUser.serializer())

object LossyTrackedLinkListOrNullSerializer :
    KSerializer<List<TrackedLink>?> by LossyNullableListSerializer(TrackedLink.serializer())
