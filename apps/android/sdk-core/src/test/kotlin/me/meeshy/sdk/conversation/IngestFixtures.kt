package me.meeshy.sdk.conversation

import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiMessageSender

/** Le même message tel que chacun des trois canaux le sert. */
internal object IngestFixtures {
    const val CREATED_AT = "2026-06-01T10:00:00Z"

    /** La charge riche du REST : expéditeur, pièce, type, compteurs. */
    fun rest(
        id: String = "m1",
        conversationId: String = "c1",
        content: String = "salut",
        deliveredCount: Int = 1,
        editedAt: String? = null,
    ) = ApiMessage(
        id = id,
        conversationId = conversationId,
        senderId = "u1",
        content = content,
        messageType = "image",
        isEdited = editedAt != null,
        editedAt = editedAt,
        createdAt = CREATED_AT,
        sender = ApiMessageSender(userId = "u1", displayName = "Ana"),
        deliveredCount = deliveredCount,
        attachments = listOf(ApiMessageAttachment(id = "a1", fileUrl = "https://cdn/a1.jpg")),
    )

    /** L'écho socket, allégé : ni expéditeur détaillé ni pièce. */
    fun socket(id: String = "m1", conversationId: String = "c1") = ApiMessage(
        id = id,
        conversationId = conversationId,
        senderId = "u1",
        content = "salut",
        createdAt = CREATED_AT,
    )
}
