package me.meeshy.sdk.model.ongoing

/** Ce qu'une ligne de la file est, pour la surface « envoi en cours » : jamais son contenu. */
enum class OutboxActivityKind { Story, Media, MessageWithMedia, Text, Other }

/**
 * Une ligne de la file telle que la loi la lit. [dependsOnIds] porte les lignes que celle-ci
 * attend (un message derrière son téléversement) : elle ne se compte pas deux fois.
 */
data class OutboxActivityItem(
    val id: String,
    val kind: OutboxActivityKind,
    val isTerminal: Boolean,
    val dependsOnIds: Set<String> = emptySet(),
)

enum class OutboxActivityPhase { Sending, WaitingForNetwork, Sent, Failed }

/** Ce qui est servi à la notification : un libellé neutre par type, jamais le texte ni le média. */
data class OutboxActivitySnapshot(
    val phase: OutboxActivityPhase,
    val remaining: Int,
    val label: String,
)

/**
 * **Quand la notification d'envoi s'ouvre, se met à jour et se retire.** Miroir Android de
 * `OutboxActivityLaw` (iOS, #9680) : pure — la file et le réseau entrent, une action sort.
 *
 * Seuls les envois LONGS (média, story, message qui porte un média) méritent une notification ;
 * le texte, la réaction et le reste de la file sont trop brefs et restent à la pastille.
 * Les libellés viennent du TYPE de la ligne, jamais de son contenu : une conversation chiffrée
 * ou un message protégé ne peut rien laisser sur l'écran verrouillé.
 */
object OutboxActivityLaw {

    data class Running(
        val snapshot: OutboxActivitySnapshot,
        val trackedIds: Set<String>,
        val failedIds: Set<String>,
    )

    sealed interface Action {
        data object None : Action
        data class Start(val snapshot: OutboxActivitySnapshot) : Action
        data class Update(val snapshot: OutboxActivitySnapshot) : Action
        data class End(val snapshot: OutboxActivitySnapshot) : Action
    }

    data class Step(val running: Running?, val action: Action)

    data class Wording(
        val story: String,
        val media: String,
        val messageWithMedia: String,
        val sent: String,
        val failed: String,
    )

    const val SENT_DISMISS_MS: Long = 3_000L
    const val FAILED_DISMISS_MS: Long = 8_000L

    fun isLong(item: OutboxActivityItem): Boolean = when (item.kind) {
        OutboxActivityKind.Story, OutboxActivityKind.Media, OutboxActivityKind.MessageWithMedia -> true
        OutboxActivityKind.Text, OutboxActivityKind.Other -> false
    }

    fun step(running: Running?, items: List<OutboxActivityItem>, isOffline: Boolean, wording: Wording): Step {
        val long = items.filter(::isLong)
        val active = long.filterNot { it.isTerminal }
        val tracked = running?.trackedIds.orEmpty()
        val failed = running?.failedIds.orEmpty() + long.filter { it.isTerminal && it.id in tracked }.map { it.id }

        val head = active.firstOrNull()
            ?: return if (running == null) Step(null, Action.None) else Step(null, Action.End(outcome(failed.isNotEmpty(), wording)))

        val activeIds = active.map { it.id }.toSet()
        val snapshot = OutboxActivitySnapshot(
            phase = if (isOffline) OutboxActivityPhase.WaitingForNetwork else OutboxActivityPhase.Sending,
            remaining = active.count { row -> row.dependsOnIds.none { it in activeIds } },
            label = label(head, wording),
        )
        val next = Running(snapshot, tracked + activeIds, failed)
        if (running == null) return Step(next, Action.Start(snapshot))
        return Step(next, if (running.snapshot == snapshot) Action.None else Action.Update(snapshot))
    }

    /** Une réussite se constate d'un regard ; un échec se lit et se relance depuis l'app. */
    fun dismissalDelayMs(phase: OutboxActivityPhase): Long =
        if (phase == OutboxActivityPhase.Failed) FAILED_DISMISS_MS else SENT_DISMISS_MS

    private fun label(item: OutboxActivityItem, wording: Wording): String = when (item.kind) {
        OutboxActivityKind.Story -> wording.story
        OutboxActivityKind.MessageWithMedia -> wording.messageWithMedia
        else -> wording.media
    }

    private fun outcome(failed: Boolean, wording: Wording) = OutboxActivitySnapshot(
        phase = if (failed) OutboxActivityPhase.Failed else OutboxActivityPhase.Sent,
        remaining = 0,
        label = if (failed) wording.failed else wording.sent,
    )
}
