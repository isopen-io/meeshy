package me.meeshy.sdk.model.share

import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.contentExitSubject
import me.meeshy.sdk.model.quotesProtectedContent

/*
 * Ce que le plan de partage lit d'un message (#10947) — miroir de `SharePlan+Message.swift`.
 * Les drapeaux sont ceux de la loi de sortie ([contentExitSubject]) : le partage ne relit
 * jamais un drapeau brut.
 */

/** La pièce telle que le plan la lit : sa famille, son poids, sa durée et SES drapeaux de protection. */
val ApiMessageAttachment.shareMedia: ShareMedia
    get() = ShareMedia(
        id = id,
        mimeType = mimeType.orEmpty(),
        bytes = fileSize?.takeIf { it > 0 }?.toLong(),
        durationMs = duration,
        isViewOnce = isViewOnce,
        isBlurred = isBlurred,
        effectFlags = effectFlags,
    )

private val ApiMessageAttachment.isPlace: Boolean
    get() = latitude != null && longitude != null

/**
 * Le message tel que le plan le lit — les drapeaux de la loi de sortie, le chiffrement du
 * message, de ses pièces OU de sa conversation, la citation d'un contenu protégé, et ses
 * pièces hors lieu (un lieu partagé ne sort pas comme un fichier).
 */
fun ApiMessage.shareMessage(conversationIsEncrypted: Boolean = false): ShareMessage {
    val subject = contentExitSubject
    return ShareMessage(
        id = id,
        text = content.ifEmpty { null },
        isViewOnce = subject.isViewOnce,
        isBlurred = subject.isBlurred,
        effectFlags = subject.effectFlags,
        ephemeralDuration = subject.ephemeralDuration,
        expiresAt = expiresAt?.takeIf { it.isNotBlank() },
        encrypted = conversationIsEncrypted || isEncrypted == true || attachments.any { it.isEncrypted == true },
        citesProtected = quotesProtectedContent,
        pieces = attachments.filterNot { it.isPlace }.map { it.shareMedia },
    )
}
