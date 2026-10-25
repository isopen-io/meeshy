package me.meeshy.app.conversations

import me.meeshy.sdk.friend.BlockActionCoordinator
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.report.ReportRepository
import javax.inject.Inject

/**
 * Blocage du pair d'une directe, vu par la liste. `true` quand le geste a pris (le cache de
 * blocage porte le nouvel état) ; `false` quand il a été refusé sur-le-champ (file impossible,
 * état restauré par le coordinateur) — la liste n'archive alors rien.
 */
interface ConversationPeerBlocker {
    suspend fun block(userId: String): Boolean
    suspend fun unblock(userId: String): Boolean
}

/** Signalement d'une conversation : `null` = inerte (pas de session, pas d'id). */
fun interface ConversationReporter {
    suspend fun report(conversationId: String, reason: ReportReason, details: String?): NetworkResult<Unit>?
}

/** Le blocage durable partagé (profil, conversation, liste des bloqués) : file + cache optimiste. */
internal class CoordinatedPeerBlocker(
    private val coordinator: BlockActionCoordinator,
    private val cache: BlockCache,
) : ConversationPeerBlocker {
    override suspend fun block(userId: String): Boolean {
        coordinator.block(userId)
        return cache.isBlocked(userId)
    }

    override suspend fun unblock(userId: String): Boolean {
        coordinator.unblock(userId)
        return !cache.isBlocked(userId)
    }
}

/**
 * Les collaborateurs injectés des dialogues de la liste, groupés pour que le ViewModel ne prenne
 * qu'UN paramètre de plus. [detached] câble un ensemble inerte (tests, aperçus).
 */
class ConversationListDialogDeps(
    val blocker: ConversationPeerBlocker,
    val reporter: ConversationReporter,
) {
    @Inject
    constructor(
        coordinator: BlockActionCoordinator,
        cache: BlockCache,
        reports: ReportRepository,
    ) : this(
        blocker = CoordinatedPeerBlocker(coordinator, cache),
        reporter = ConversationReporter { id, reason, details -> reports.reportConversation(id, reason, details) },
    )

    companion object {
        fun detached(): ConversationListDialogDeps = ConversationListDialogDeps(
            blocker = object : ConversationPeerBlocker {
                override suspend fun block(userId: String): Boolean = false
                override suspend fun unblock(userId: String): Boolean = false
            },
            reporter = ConversationReporter { _, _, _ -> null },
        )
    }
}
