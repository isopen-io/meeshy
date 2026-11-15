package me.meeshy.sdk.model.composer

enum class TrayEntryKind { PREPARING, READY, PLACE }

/** Une case du plateau : sa clé stable, sa nature, son libellé et son rang pour TalkBack. */
data class TrayEntry(
    val key: String,
    val kind: TrayEntryKind,
    val label: String?,
    val item: PendingAttachment?,
    val position: Int,
    val total: Int,
)

data class ComposerTray(val entries: List<TrayEntry>, val capReached: Boolean) {
    /** Vide ⇒ le plateau est ABSENT (pas de bandeau vide). */
    val isEmpty: Boolean get() = entries.isEmpty()
}

/**
 * **L'ORDRE DU PLATEAU** (`ComposerAttachmentZone`, iOS) : d'abord les pièces en préparation, puis les prêtes
 * (dans l'ordre du choix), puis la tuile du lieu en attente. Une pièce en échec n'a pas de tuile (pas de fantôme).
 */
object ComposerTrayPresenter {
    const val PLACE_KEY: String = "__pending_place__"

    fun present(items: List<PendingAttachment>, place: PendingPlace?): ComposerTray {
        val live = items.filter { it.phase !is PendingAttachmentPhase.Failed }
        val preparing = live.filter { it.phase is PendingAttachmentPhase.Preparing }
        val ready = live.filter { it.phase is PendingAttachmentPhase.Ready }
        val total = preparing.size + ready.size + if (place?.isValid == true) 1 else 0
        val raw = preparing.map { it to TrayEntryKind.PREPARING } + ready.map { it to TrayEntryKind.READY }
        val pieces = raw.mapIndexed { index, (item, kind) ->
            TrayEntry(item.id, kind, item.fileName?.takeIf { it.isNotBlank() }, item, index + 1, total)
        }
        val placeEntry = place?.takeIf { it.isValid }?.let {
            TrayEntry(PLACE_KEY, TrayEntryKind.PLACE, it.name?.takeIf(String::isNotBlank) ?: it.address?.takeIf(String::isNotBlank), null, total, total)
        }
        return ComposerTray(
            entries = pieces + listOfNotNull(placeEntry),
            capReached = items.size >= ComposerAttachmentLimits.MAX_PENDING_ATTACHMENTS,
        )
    }
}
