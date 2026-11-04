package me.meeshy.sdk.story

import java.io.File
import java.util.UUID
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryDraftIndex
import me.meeshy.sdk.model.StoryDraftSummary

/**
 * La bibliothèque de brouillons de story (iOS `StoryDraftStore`) : PLUSIEURS brouillons, chacun sous son identifiant,
 * plus l'emplacement unique du composeur (le brouillon d'avant) rangé comme le premier d'entre eux — jamais perdu.
 *
 * Le composeur n'ouvre qu'UN brouillon, par son emplacement : [activate] y verse celui qu'on reprend, après avoir mis à
 * l'abri celui qui s'y trouvait. Rien n'est supprimé avant que la copie soit relue identique. Bloque sur le disque.
 */
public class StoryDraftLibrary(
    private val store: StoryDraftStoring,
    private val slot: StoryComposerDraftStore,
    private val media: LegacyDraftMediaSource,
    private val staging: File,
    private val clock: () -> Long = System::currentTimeMillis,
    private val io: CoroutineDispatcher = Dispatchers.IO,
    private val newId: () -> String = { UUID.randomUUID().toString() },
) {
    private val version = MutableStateFlow(0)

    /** Du plus récent au plus ancien ; relit la bibliothèque à chaque changement de l'emplacement ou de [refresh]. */
    public fun observe(): Flow<List<StoryDraftSummary>> =
        combine(slot.observe(), version) { snapshot, _ -> snapshot }
            .map { snapshot -> StoryDraftIndex.merged(store.listDrafts(), StoryDraftIndex.slotSummary(snapshot, clock())) }
            .flowOn(io)

    public fun refresh() {
        version.update { it + 1 }
    }

    /** Supprime le brouillon [draftId] (l'emplacement du composeur compris). */
    public suspend fun delete(draftId: String): Boolean {
        val removed = if (draftId == StoryDraftIndex.SLOT_ID) {
            runCatching { slot.clear() }.isSuccess
        } else {
            withContext(io) { store.delete(draftId) }
        }
        refresh()
        return removed
    }

    /** Rend le brouillon [draftId] au composeur. `false` : rien n'a bougé, le brouillon reste où il est. */
    public suspend fun activate(draftId: String): Boolean = withContext(io) {
        if (draftId == StoryDraftIndex.SLOT_ID) return@withContext true
        val snapshot = store.peek(draftId) ?: return@withContext false
        val current = slot.load()
        if (current?.isAwaitingPublication == true) return@withContext false
        if (current != null && current.isWorthRestoring && !shelve(current)) return@withContext false
        runCatching { slot.save(snapshot) }.getOrElse { return@withContext false }
        if (slot.load() != snapshot) return@withContext false
        store.delete(draftId)
        refresh()
        true
    }

    private suspend fun shelve(current: StoryComposerDraftSnapshot): Boolean {
        val batch = File(staging, UUID.randomUUID().toString())
        try {
            if (!batch.isDirectory && !batch.mkdirs()) return false
            val ids = current.slides.flatMap { it.mediaIds + listOfNotNull(it.backgroundMediaId) + it.placedMedia.map { m -> m.id } }.distinct()
            val files = copyNamedMedia(ids, media, batch) ?: return false
            val id = StoryDraftIndex.freshId(store.listDrafts().mapTo(HashSet()) { it.id }, newId)
            val saved = store.save(id, current, files) && store.peek(id) == current && store.mediaNames(id).containsAll(files.keys)
            if (!saved) store.delete(id)
            return saved
        } finally {
            batch.deleteRecursively()
        }
    }
}
