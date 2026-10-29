package me.meeshy.app.feed

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.StatusEntry

/**
 * L'humeur de chacun, lue par le rail de stories — iOS `statusViewModel.statusForUser(userId:)` :
 * l'humeur vit SUR l'avatar (badge, appui), plus dans une barre de pastilles à part (#13653).
 * Pur et immuable : le rail reçoit un instantané, jamais le flux.
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

    /** L'humeur du compte courant, présente même sans anneau de story. */
    val myEmoji: String? get() = mine?.moodEmoji?.takeIf { it.isNotBlank() }

    companion object {
        fun from(state: StatusesUiState): MoodLookup {
            val mine = state.myStatus
            val entries = buildList {
                addAll(state.statuses)
                mine?.let(::add)
            }
            return MoodLookup(
                byUser = entries.filter { it.userId.isNotBlank() }.associateBy { it.userId },
                mine = mine,
            )
        }
    }
}
