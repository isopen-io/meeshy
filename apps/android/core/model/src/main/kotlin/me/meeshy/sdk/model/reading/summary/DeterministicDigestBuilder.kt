package me.meeshy.sdk.model.reading.summary

import java.time.Instant

/**
 * Digest déterministe — miroir de `DeterministicDigestBuilder.swift`. Tous les comptes
 * viennent des messages RÉELLEMENT chargés ; [build] transmet `windowCoversUnread` tel quel
 * dans `isComplete` sans le décider. Les messages système sont exclus des comptes.
 */
object DeterministicDigestBuilder {

    fun build(
        messages: List<DigestInputMessage>,
        participants: List<DigestParticipant>,
        viewerId: String,
        episodes: List<ConversationEpisode>,
        windowCoversUnread: Boolean,
    ): DeterministicConversationDigest {
        if (messages.isEmpty()) {
            return DeterministicConversationDigest.EMPTY.copy(episodes = episodes, isComplete = windowCoversUnread)
        }
        val sorted = messages.sortedBy { it.createdAt }
        val real = sorted.filterNot { it.isSystem }
        val knownIds = participants.map { it.id }.toSet()
        val activeSenderIds = real.map { it.senderId }.toSet()
        val counted = if (knownIds.isEmpty()) activeSenderIds else knownIds.intersect(activeSenderIds)
        val byId = sorted.associateBy { it.id }
        return DeterministicConversationDigest(
            messageCount = real.size,
            participantCount = counted.size,
            start = sorted.first().createdAt,
            end = sorted.last().createdAt,
            topSenders = topSenders(real),
            languages = languages(real),
            media = media(real),
            awaitingYou = awaitingYou(real, byId, viewerId),
            episodes = episodes,
            isComplete = windowCoversUnread,
        )
    }

    private fun topSenders(real: List<DigestInputMessage>): List<SenderTally> =
        real.groupBy { it.senderId }
            .map { (userId, list) -> SenderTally(userId, list.size, list.maxOf { it.createdAt }) }
            .sortedWith(compareByDescending<SenderTally> { it.messageCount }.thenBy { it.userId })

    private fun languages(real: List<DigestInputMessage>): List<LanguageTally> =
        real.mapNotNull { it.languageCode?.takeIf(String::isNotEmpty) }
            .groupingBy { it }.eachCount()
            .map { (code, count) -> LanguageTally(code, count) }
            .sortedWith(compareByDescending<LanguageTally> { it.messageCount }.thenBy { it.code })

    private fun media(real: List<DigestInputMessage>): MediaTally {
        val kinds = real.flatMap { it.attachmentKinds }
        fun count(kind: DigestMediaKind) = kinds.count { it == kind }
        return MediaTally(
            images = count(DigestMediaKind.IMAGE),
            videos = count(DigestMediaKind.VIDEO),
            audios = count(DigestMediaKind.AUDIO),
            files = count(DigestMediaKind.FILE),
            locations = count(DigestMediaKind.LOCATION),
            links = real.sumOf { it.linkCount },
        )
    }

    /**
     * Une mention / question est « sans réponse » si AUCUN message du lecteur ne la suit dans la
     * fenêtre fournie. Une réponse directe est structurelle (`replyToId` vise un message du lecteur).
     */
    private fun awaitingYou(
        real: List<DigestInputMessage>,
        byId: Map<String, DigestInputMessage>,
        viewerId: String,
    ): List<AwaitingItem> {
        val viewerLastAt = real.filter { it.senderId == viewerId }.maxOfOrNull { it.createdAt } ?: Instant.MIN
        return real.filter { it.senderId != viewerId }
            .flatMap { message ->
                val unanswered = message.createdAt > viewerLastAt
                val isReplyToViewer = message.replyToId?.let { byId[it]?.senderId == viewerId } == true
                listOfNotNull(
                    item("mention_", AwaitingKind.MENTION, message).takeIf { message.mentionsViewer && unanswered },
                    item("reply_", AwaitingKind.DIRECT_REPLY, message).takeIf { isReplyToViewer },
                    item("question_", AwaitingKind.UNANSWERED_QUESTION, message)
                        .takeIf { message.content.trim().endsWith("?") && unanswered },
                )
            }
            .sortedBy { it.at }
    }

    private fun item(prefix: String, kind: AwaitingKind, message: DigestInputMessage): AwaitingItem =
        AwaitingItem(
            id = prefix + message.id, kind = kind, fromUserId = message.senderId,
            evidenceMessageIds = listOf(message.id), at = message.createdAt,
        )
}
