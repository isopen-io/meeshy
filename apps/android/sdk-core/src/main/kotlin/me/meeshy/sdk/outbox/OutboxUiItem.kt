package me.meeshy.sdk.outbox

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.model.sync.OutboxNavigationSource
import me.meeshy.sdk.model.sync.OutboxUiIcon
import me.meeshy.sdk.model.sync.OutboxUiItem
import me.meeshy.sdk.model.sync.OutboxUiKind
import me.meeshy.sdk.model.sync.OutboxUiProjection
import me.meeshy.sdk.model.sync.OutboxUiStatus

/**
 * Projette une ligne de l'outbox en [OutboxUiItem] (miroir d'iOS `OutboxUIItem.from(record:)`). Une charge illisible
 * n'est jamais fatale : l'entrée retombe sur des défauts sûrs (pas d'aperçu, icône générique, pas d'ancre), pour qu'une
 * seule ligne corrompue ne cache pas toute la file. Les horloges de la ligne voyagent par construction.
 *
 * Ce que l'ancre contient dépend de ce que l'entrée EST : un envoi vise l'id LOCAL de la bulle optimiste (le `cmid` de
 * la ligne), une édition / suppression / réaction l'id SERVEUR de sa cible (`targetId`).
 */
public fun OutboxEntity.toUiItem(): OutboxUiItem? {
    val outboxKind = kindEnum ?: return null
    val facts = OutboxRowFacts.pillFacts(outboxKind)
    val body = parseObject(payload)
    val base = OutboxUiItem(
        id = cmid,
        kind = facts.kind,
        titlePreview = null,
        iconKind = OutboxUiIcon.NONE,
        attachmentCount = 0,
        source = OutboxNavigationSource.Unknown,
        status = uiStatus(),
        createdAt = createdAt,
        updatedAt = updatedAt,
        otherKey = facts.otherKey,
    )
    val conversationId = lane.removePrefix(MESSAGE_LANE_PREFIX).takeIf { lane.startsWith(MESSAGE_LANE_PREFIX) && it.isNotBlank() }
    return when (outboxKind) {
        OutboxKind.SEND_MESSAGE -> messageItem(base, body, e2ee = false)
        OutboxKind.SEND_E2EE_MESSAGE -> messageItem(base, body, e2ee = true)
        OutboxKind.EDIT_MESSAGE -> base.copy(
            titlePreview = body.string("content")?.takeIf { it.isNotEmpty() }?.let(OutboxUiProjection::truncatePreview),
            iconKind = OutboxUiIcon.TEXT,
            source = mutationSource(conversationId, targetId),
        )
        OutboxKind.DELETE_MESSAGE -> base.copy(
            iconKind = OutboxUiIcon.TEXT,
            source = mutationSource(conversationId, targetId),
        )
        OutboxKind.ADD_REACTION, OutboxKind.REMOVE_REACTION -> base.copy(
            titlePreview = body.string("emoji"),
            iconKind = OutboxUiIcon.REACTION,
            source = mutationSource(body.string("conversationId"), targetId),
        )
        OutboxKind.PUBLISH_STORY -> base.copy(
            iconKind = OutboxUiIcon.IMAGE,
            source = OutboxNavigationSource.forStory(targetId.takeUnless { it.startsWith(PENDING_STORY_PREFIX) }),
        )
        OutboxKind.CREATE_COMMENT -> base.copy(
            titlePreview = body.string("content")?.takeIf { it.isNotEmpty() }?.let(OutboxUiProjection::truncatePreview),
            iconKind = OutboxUiIcon.TEXT,
            source = OutboxNavigationSource.forPost(targetId),
        )
        OutboxKind.LIKE_POST, OutboxKind.UNLIKE_POST, OutboxKind.BOOKMARK_POST, OutboxKind.UNBOOKMARK_POST -> base.copy(
            titlePreview = if (outboxKind == OutboxKind.LIKE_POST || outboxKind == OutboxKind.UNLIKE_POST) DEFAULT_REACTION else null,
            iconKind = OutboxUiIcon.REACTION,
            source = OutboxNavigationSource.forPost(targetId),
        )
        OutboxKind.CREATE_POST -> base.copy(
            titlePreview = body.string("content")?.takeIf { it.isNotEmpty() }?.let(OutboxUiProjection::truncatePreview),
            iconKind = OutboxUiIcon.TEXT,
        )
        OutboxKind.REPOST_POST -> base.copy(
            titlePreview = body.string("content")?.takeIf { it.isNotEmpty() }?.let(OutboxUiProjection::truncatePreview),
            iconKind = OutboxUiIcon.TEXT,
            source = OutboxNavigationSource.forPost(targetId),
        )
        else -> base
    }
}

/**
 * Un envoi de message. L'aperçu ne porte JAMAIS le texte d'un message protégé (vue unique, flouté, éphémère) ni d'un
 * message chiffré de bout en bout (la ligne n'a aucun clair) : seule la nature du contenu s'annonce, par un pictogramme.
 * L'ancre est l'id LOCAL de la bulle optimiste — le `cmid` de la ligne ; la conversation est la cible de la ligne.
 */
private fun OutboxEntity.messageItem(base: OutboxUiItem, payload: JsonObject?, e2ee: Boolean): OutboxUiItem {
    val attachmentIds = payload?.get("attachmentIds")?.let { runCatching { it.jsonArray }.getOrNull() }?.size ?: 0
    val protectedContent = e2ee || payload.flag("isViewOnce") || payload.flag("isBlurred") ||
        payload.string("expiresAt") != null || (payload.int("ephemeralDuration") ?: 0) > 0
    val content = payload.string("content")?.takeIf { it.isNotEmpty() && !protectedContent }
    val mediaIcon = iconForMedia(payload.string("messageType"), attachmentIds)
    val (icon, preview) = when {
        content != null -> OutboxUiIcon.TEXT to OutboxUiProjection.truncatePreview(content)
        mediaIcon != null -> mediaIcon to mediaGlyph(mediaIcon)
        else -> OutboxUiIcon.TEXT to null
    }
    return base.copy(
        titlePreview = preview,
        iconKind = icon,
        attachmentCount = attachmentIds,
        source = OutboxNavigationSource.forSend(targetId, cmid),
    )
}

private fun iconForMedia(messageType: String?, attachmentCount: Int): OutboxUiIcon? = when (messageType?.lowercase()) {
    "audio" -> OutboxUiIcon.AUDIO
    "image" -> OutboxUiIcon.IMAGE
    "video" -> OutboxUiIcon.VIDEO
    "sticker" -> OutboxUiIcon.STICKER
    "file", "document" -> OutboxUiIcon.FILE
    else -> if (attachmentCount > 0) OutboxUiIcon.IMAGE else null
}

private fun mediaGlyph(icon: OutboxUiIcon): String = when (icon) {
    OutboxUiIcon.AUDIO -> "\uD83C\uDFA4"
    OutboxUiIcon.VIDEO -> "\uD83C\uDF9E"
    OutboxUiIcon.FILE -> "\uD83D\uDCCE"
    OutboxUiIcon.STICKER -> "\uD83D\uDE42"
    else -> "\uD83D\uDCF7"
}

private fun OutboxEntity.uiStatus(): OutboxUiStatus = when (stateEnum) {
    OutboxState.PENDING -> OutboxUiStatus.PENDING
    OutboxState.INFLIGHT -> OutboxUiStatus.INFLIGHT
    OutboxState.EXHAUSTED -> OutboxUiStatus.EXHAUSTED
}

private fun mutationSource(conversationId: String?, messageId: String?): OutboxNavigationSource =
    conversationId?.takeIf { it.isNotBlank() }
        ?.let { OutboxNavigationSource.forMutation(it, messageId) }
        ?: OutboxNavigationSource.Unknown

private fun parseObject(raw: String): JsonObject? =
    raw.takeIf { it.isNotBlank() }?.let { runCatching { Json.parseToJsonElement(it).jsonObject }.getOrNull() }

private fun JsonObject?.flag(name: String): Boolean = (this?.get(name) as? JsonPrimitive)?.contentOrNull == "true"

private fun JsonObject?.int(name: String): Int? = (this?.get(name) as? JsonPrimitive)?.contentOrNull?.toIntOrNull()

private fun JsonObject?.string(name: String): String? =
    (this?.get(name) as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull

private const val MESSAGE_LANE_PREFIX = "message:"
private const val PENDING_STORY_PREFIX = "pending_"
private const val DEFAULT_REACTION = "👍"
