package me.meeshy.app.chat

import java.time.Instant
import java.time.ZoneId
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.sdk.model.reading.summary.DigestMediaKind
import me.meeshy.sdk.model.reading.summary.LivingSummary
import me.meeshy.sdk.model.reading.summary.LivingSummaryAssembly
import me.meeshy.sdk.model.reading.summary.LivingSummaryInput
import me.meeshy.sdk.model.reading.summary.SummaryProtectionFacts
import me.meeshy.sdk.model.reading.summary.SummarySourceMessage
import me.meeshy.ui.component.bubble.BubbleContent

/** Le lecteur tel que le Résumé le lit : son id (invité : participant) et son pseudo. */
data class SummaryViewer(val id: String, val username: String?)

/**
 * Le pont des bulles du fil vers les lois du Résumé vivant (`:core:model`). Aucune loi n'est
 * réécrite ici : seulement l'instantané que `LivingSummaryAssembly` attend, déjà résolu.
 *
 * Un message PROTÉGÉ — vue unique, éphémère, flouté, supprimé ou scellé de bout en bout — est
 * transmis avec `isProtected = true` : il reste COMPTÉ, son texte n'entre jamais dans un calcul.
 */
internal object LivingSummaryProjection {

    fun assemble(
        bubbles: List<BubbleContent>,
        viewer: SummaryViewer,
        windowCoversUnread: Boolean,
        zone: ZoneId = ZoneId.systemDefault(),
        now: Instant = Instant.now(),
    ): LivingSummary = LivingSummaryAssembly.assemble(
        LivingSummaryInput(
            messages = bubbles.mapNotNull { sourceOf(it, viewer) },
            viewerId = viewer.id,
            viewerUsername = viewer.username,
            windowCoversUnread = windowCoversUnread,
            zone = zone,
            now = now,
        ),
    )

    /** Les messages protégés encore vivants de la fenêtre, pour la section « Ce qui va disparaître ». */
    fun protectionFacts(bubbles: List<BubbleContent>): List<SummaryProtectionFacts> =
        bubbles.filter { isProtected(it) }.map { bubble ->
            SummaryProtectionFacts(
                id = bubble.messageId,
                senderDisplayName = senderName(bubble),
                isViewOnce = bubble.isViewOnce,
                isViewOnceConsumed = bubble.isViewOnceOpenedByMe,
                isBlurred = bubble.isBlurred || bubble.blurReveal != null,
                isEphemeral = bubble.expiresAtIso != null,
                expiresAt = bubble.expiresAtIso?.let(::instantOf),
                isDeleted = bubble.isDeleted,
                isSystem = bubble.isSystem,
            )
        }

    internal fun isProtected(bubble: BubbleContent): Boolean =
        bubble.isViewOnce ||
            bubble.isBlurred ||
            bubble.blurReveal != null ||
            bubble.expiresAtIso != null ||
            bubble.isEndToEndSealed ||
            bubble.holdsEndToEndSend ||
            bubble.isDeleted

    private fun sourceOf(bubble: BubbleContent, viewer: SummaryViewer): SummarySourceMessage? {
        val createdAt = bubble.createdAtIso?.let(::instantOf) ?: return null
        return SummarySourceMessage(
            id = bubble.messageId,
            senderId = bubble.senderId ?: viewer.id,
            senderName = bubble.senderName,
            senderUsername = bubble.senderUsername,
            senderColorHex = bubble.senderColorHex,
            senderAvatarUrl = bubble.senderAvatarUrl,
            createdAt = createdAt,
            replyToId = bubble.replyToId,
            isSystem = bubble.isSystem,
            content = bubble.text,
            originalLanguage = null,
            attachmentKinds = attachmentKinds(bubble),
            linkCount = 0,
            isProtected = isProtected(bubble),
        )
    }

    private fun attachmentKinds(bubble: BubbleContent): List<DigestMediaKind> =
        bubble.images.map { DigestMediaKind.IMAGE } +
            List(bubble.videoCount) { DigestMediaKind.VIDEO } +
            bubble.audios.map { DigestMediaKind.AUDIO } +
            bubble.files.filter { !it.isVideo && !it.isContactCard }.map { DigestMediaKind.FILE } +
            bubble.locations.map { DigestMediaKind.LOCATION }

    private fun senderName(bubble: BubbleContent): String =
        bubble.senderName ?: bubble.senderUsername ?: bubble.senderId.orEmpty()

    private fun instantOf(iso: String): Instant? = isoToEpochMillisOrNull(iso)?.let(Instant::ofEpochMilli)
}
