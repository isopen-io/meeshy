package me.meeshy.sdk.model.reading.summary

import java.time.Instant
import java.time.ZoneId
import me.meeshy.sdk.model.PresenceState

/**
 * Un message tel que l'assemblage le voit — instantané déjà résolu par l'appelant (aucun type
 * réseau ou Room ici). [isProtected] vaut `true` pour vue unique, éphémère (y compris échu),
 * flouté ou chiffré : son texte est alors vidé avant tout calcul.
 */
data class SummarySourceMessage(
    val id: String,
    val senderId: String,
    val senderName: String?,
    val senderUsername: String?,
    val senderColorHex: String?,
    val senderAvatarUrl: String?,
    val createdAt: Instant,
    val replyToId: String?,
    val isSystem: Boolean,
    val content: String,
    val originalLanguage: String?,
    val attachmentKinds: List<DigestMediaKind>,
    val linkCount: Int,
    val isProtected: Boolean,
)

data class LivingSummaryInput(
    val messages: List<SummarySourceMessage>,
    val viewerId: String,
    val viewerUsername: String?,
    val windowCoversUnread: Boolean,
    val zone: ZoneId,
    val now: Instant,
    /** Présence servie par le magasin unique ; absente ⇒ `OFFLINE` (aucun point). */
    val presenceOf: (senderId: String) -> PresenceState? = { null },
)

data class LivingSummary(
    val digest: DeterministicConversationDigest,
    val faceRamp: List<FaceRampEntry>,
)

/**
 * Seul point qui assemble épisodes, digest et Rampe — miroir de `LivingSummaryAssembly.swift`.
 * Un message protégé reste COMPTÉ mais son texte n'entre jamais dans un calcul dérivé.
 */
object LivingSummaryAssembly {
    const val FALLBACK_COLOR_HEX = "#31B6BA"

    fun assemble(input: LivingSummaryInput): LivingSummary {
        val episodes = EpisodeSegmenter.segment(input.messages.map(::episodeInput), input.zone)
        val participants = deriveParticipants(input)
        val digest = DeterministicDigestBuilder.build(
            messages = input.messages.map { digestInput(it, input.viewerUsername) },
            participants = participants,
            viewerId = input.viewerId,
            episodes = episodes,
            windowCoversUnread = input.windowCoversUnread,
        )
        val ramp = FaceRampRanking.rank(FaceRampRanking.makeInputs(digest.awaitingYou, participants), input.now)
        return LivingSummary(digest, ramp)
    }

    private fun episodeInput(m: SummarySourceMessage) =
        EpisodeInputMessage(m.id, m.senderId, m.createdAt, m.replyToId, m.isSystem)

    private fun digestInput(m: SummarySourceMessage, viewerUsername: String?): DigestInputMessage {
        val visibleContent = if (m.isProtected) "" else m.content
        return DigestInputMessage(
            base = episodeInput(m),
            content = visibleContent,
            languageCode = m.originalLanguage,
            attachmentKinds = m.attachmentKinds,
            linkCount = m.linkCount,
            mentionsViewer = mentionsViewer(visibleContent, viewerUsername),
        )
    }

    /** `@username` insensible à la casse ; jamais sur un texte protégé (vidé), jamais sans username. */
    internal fun mentionsViewer(content: String, viewerUsername: String?): Boolean =
        !viewerUsername.isNullOrEmpty() && content.contains("@$viewerUsername", ignoreCase = true)

    private fun deriveParticipants(input: LivingSummaryInput): List<DigestParticipant> =
        input.messages.distinctBy { it.senderId }.map { m ->
            DigestParticipant(
                id = m.senderId,
                displayName = m.senderName ?: m.senderUsername ?: m.senderId,
                avatarUrl = m.senderAvatarUrl,
                colorHex = m.senderColorHex ?: FALLBACK_COLOR_HEX,
                presence = input.presenceOf(m.senderId) ?: PresenceState.OFFLINE,
            )
        }
}
