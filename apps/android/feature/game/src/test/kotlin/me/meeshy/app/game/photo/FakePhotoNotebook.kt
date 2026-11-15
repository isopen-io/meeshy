package me.meeshy.app.game.photo

import me.meeshy.sdk.model.game.photo.GamePhotoMoment
import me.meeshy.sdk.model.game.photo.GamePhotoNotebookIndex
import me.meeshy.sdk.model.game.photo.NotebookEntry
import me.meeshy.sdk.model.game.photo.NotebookKeepOutcome

/** Une Chronique en mémoire, menée par la même loi que celle du disque ; un refus se programme par geste. */
internal class FakePhotoNotebook(
    initial: List<NotebookEntry> = emptyList(),
    var keepOutcome: NotebookKeepOutcome = NotebookKeepOutcome.Kept,
    var removeSucceeds: Boolean = true,
) : GamePhotoNotebooking {
    var entries: List<NotebookEntry> = initial
        private set
    val kept = mutableListOf<Pair<GamePhotoMoment, KeptPhoto>>()
    val postponed = mutableListOf<GamePhotoMoment>()
    private var clock = 1_000L

    override suspend fun postpone(moment: GamePhotoMoment): Boolean {
        postponed += moment
        GamePhotoNotebookIndex.postpone(entries, moment, ++clock)?.let { entries = it }
        return true
    }

    override suspend fun keep(moment: GamePhotoMoment, photo: KeptPhoto): NotebookKeepOutcome {
        kept += moment to photo
        if (keepOutcome != NotebookKeepOutcome.Kept) return keepOutcome
        val entry = GamePhotoNotebookIndex.keptEntry(moment, photo.mode, photo.source != null, photo.recipe, ++clock)
        entries = GamePhotoNotebookIndex.keep(entries, entry).entries
        return NotebookKeepOutcome.Kept
    }

    override suspend fun list(): List<NotebookEntry> = GamePhotoNotebookIndex.sorted(entries)

    override suspend fun remove(momentId: String): Boolean {
        if (!removeSucceeds) return false
        GamePhotoNotebookIndex.remove(entries, momentId)?.let { entries = it.entries }
        return true
    }

    override suspend fun storyBytes(entry: NotebookEntry): ByteArray? = null

    override suspend fun occupiedBytes(): Long = entries.count { it.storyFile != null } * 2_048L
}
