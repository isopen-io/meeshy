package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

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

/** A transcription segment as decoded from the socket/API — port of TranscriptionSegment (MessageSocketManager.swift). */
@Serializable
data class TranscriptionSegment(
    val text: String = "",
    val startTime: Double? = null,
    val endTime: Double? = null,
    val speakerId: String? = null,
    val voiceSimilarityScore: Double? = null,
)

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

/** Full message sender embedded in a message API response — port of APIMessageSender (MessageModels.swift). */
@Serializable
data class ApiMessageSenderDetail(
    val id: String,
    val username: String? = null,
    val displayName: String? = null,
    val avatar: String? = null,
    val type: String? = null,
    val userId: String? = null,
    val firstName: String? = null,
    val lastName: String? = null,
    val user: ApiMessageSenderUser? = null,
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
)

/** A message attachment in an API response — port of APIMessageAttachment (MessageModels.swift). */
@Serializable
data class ApiMessageAttachment(
    val id: String,
    val fileName: String? = null,
    val originalName: String? = null,
    val mimeType: String? = null,
    val fileSize: Int? = null,
    val fileUrl: String? = null,
    val thumbnailUrl: String? = null,
    val thumbHash: String? = null,
    val width: Int? = null,
    val height: Int? = null,
    val duration: Int? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val transcription: ApiAttachmentTranscription? = null,
    val translations: Map<String, ApiAttachmentTranslation>? = null,
)

/** The message a forward originates from — port of APIForwardedFrom (MessageModels.swift). */
@Serializable
data class ApiForwardedFrom(
    val id: String,
    val content: String? = null,
    val messageType: String? = null,
    val createdAt: String? = null,
    val sender: ApiMessageSenderDetail? = null,
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
