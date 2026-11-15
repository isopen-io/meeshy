package me.meeshy.app.feed

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.MoodStatusExpiry
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.ui.profile.PeerMood

/**
 * L'humeur de chacun, lue par le rail de stories — iOS `statusViewModel.statusForUser(userId:)` :
 * l'humeur vit SUR l'avatar (badge, appui), plus dans une barre de pastilles à part (#13653).
 * Pur et immuable : le rail reçoit un instantané, jamais le flux.
 *
 * Deux règles d'iOS : la liste servie est la plus récente d'abord et un auteur peut y figurer plusieurs
 * fois — sa PREMIÈRE entrée est son humeur ; et une humeur expirée que le cache sert encore (démarrage
 * hors ligne, application restée au premier plan) ne se pose plus sur l'avatar.
 */
@Immutable
data class MoodLookup(
    private val byUser: Map<String, StatusEntry> = emptyMap(),
    private val mine: StatusEntry? = null,
) {
    /** L'emoji d'humeur de [userId], ou `null` quand il n'en pose aucune. */
    fun emojiOf(userId: String): String? = byUser[userId]?.moodEmoji?.takeIf { it.isNotBlank() }

    /** L'identifiant du statut de [userId] — la porte vers l'écran d'humeur. */
    fun statusIdOf(userId: String): String? = byUser[userId]?.id

    /** L'humeur vivante de [userId] — ce que sa bulle montre (#13662). */
    fun entryOf(userId: String): StatusEntry? = byUser[userId]

    /** La boule de mood d'un pair en conversation : son emoji et la porte vers sa page (#13987). */
    fun peerMoodOf(userId: String?): PeerMood? {
        val entry = userId?.let(byUser::get) ?: return null
        val emoji = entry.moodEmoji.takeIf { it.isNotBlank() } ?: return null
        return PeerMood(statusId = entry.id, emoji = emoji)
    }

    /** L'humeur du compte courant, présente même sans anneau de story. */
    val myEmoji: String? get() = mine?.moodEmoji?.takeIf { it.isNotBlank() }

    companion object {
        fun from(state: StatusesUiState, nowMillis: Long = System.currentTimeMillis()): MoodLookup {
            val live = { entry: StatusEntry -> !MoodStatusExpiry.isExpired(entry.createdAt, entry.expiresAt, nowMillis) }
            val mine = state.myStatus?.takeIf(live)
            val newestFirst = listOfNotNull(mine) + state.statuses
            val byUser = newestFirst
                .filter { it.userId.isNotBlank() && live(it) }
                .groupBy { it.userId }
                .mapValues { (_, entries) -> entries.first() }
            return MoodLookup(byUser = byUser, mine = mine)
        }
    }
}
