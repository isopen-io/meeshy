package me.meeshy.sdk.model

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.guest.GuestAttachmentAllowance

/**
 * The client-side anonymous (shared-link guest) session — port of iOS
 * `AnonymousSessionContext` (`apps/ios/Meeshy/Features/Main/Models/AnonymousSessionContext.swift`).
 *
 * [sessionToken] authenticates every guest request via the `X-Session-Token`
 * header; [permissions] is the **hardened** capability set (see
 * [ParticipantPermissions.anonymous]) — never the raw server payload.
 *
 * `@Serializable` so the durable [me.meeshy.sdk.session.AnonymousSessionStore]
 * can persist the whole hardened context (token + capabilities) across process
 * death, not just the raw token.
 */
@Serializable
data class AnonymousSessionContext(
    val sessionToken: String,
    val participantId: String,
    val permissions: ParticipantPermissions,
    val linkId: String,
    val conversationId: String,
) {
    /** Ce que CET invite peut joindre (iOS `attachmentAllowance`) : les termes du lien, portes par ses droits durcis. */
    val attachmentAllowance: GuestAttachmentAllowance get() = permissions.attachmentAllowance
}

/**
 * Derive the guest session context from a join response, hardening the guest's
 * capabilities. Faithful to iOS `AnonymousJoinResponse.toSessionContext`: only
 * the server's messages/files/images flags are trusted; videos, audios,
 * locations and links are force-denied via [ParticipantPermissions.anonymous].
 *
 * Diverges from iOS (which force-unwraps) by returning `null` when the response
 * cannot form a real session — a missing participant or conversation, or a blank
 * session token that could never authenticate a later guest request — so a
 * malformed response degrades gracefully instead of crashing.
 */
fun AnonymousJoinResponse.toSessionContext(): AnonymousSessionContext? {
    val participant = participant ?: return null
    val conversation = conversation ?: return null
    if (sessionToken.isBlank()) return null
    return AnonymousSessionContext(
        sessionToken = sessionToken,
        participantId = participant.id,
        permissions = ParticipantPermissions.anonymous(
            canSendMessages = participant.canSendMessages,
            canSendFiles = participant.canSendFiles,
            canSendImages = participant.canSendImages,
        ).copy(allowedAttachmentKinds = conversation.allowedAttachmentKinds),
        linkId = linkId,
        conversationId = conversation.id,
    )
}
