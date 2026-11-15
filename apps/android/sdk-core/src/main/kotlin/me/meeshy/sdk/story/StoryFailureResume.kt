package me.meeshy.sdk.story

import java.io.File
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryDraftIndex
import me.meeshy.sdk.model.StoryFailureDraft

/** Ce qu'une publication échouée portait, relu depuis sa ligne d'outbox. */
public data class StoryFailedRequest(
    val content: String?,
    val mediaIds: List<String>,
    val visibility: String,
    val visibilityUserIds: List<String>,
    val repostOfId: String?,
)

public sealed interface StoryResumeOutcome {
    /** L'échec est devenu le brouillon [draftId] ; sa ligne d'outbox est retirée. */
    public data class Resumed(val draftId: String) : StoryResumeOutcome

    /** Un autre « Reprendre » est en cours : rien n'a bougé. */
    public data object Busy : StoryResumeOutcome

    /** La ligne n'existe plus, ou ne portait rien à reprendre : rien n'a bougé. */
    public data object NothingToResume : StoryResumeOutcome

    /** La copie ou la persistance a échoué : la ligne d'outbox reste INTACTE. */
    public data object CopyFailed : StoryResumeOutcome
}

/**
 * « Reprendre » un échec de publication (iOS `MyStoriesQueueRows`) : l'échec devient un brouillon éditable, ses médias
 * copiés dans le stockage privé. La ligne d'outbox n'est retirée qu'une fois le brouillon RELU identique, médias
 * compris ; toute autre issue la laisse intacte. Un seul « Reprendre » à la fois (verrou). Bloque sur le disque.
 */
public class StoryFailureResume(
    private val store: StoryDraftStoring,
    private val media: LegacyDraftMediaSource,
    private val staging: File,
    private val readFailed: suspend (String) -> StoryFailedRequest?,
    private val discardFailed: suspend (String) -> Unit,
    private val clock: () -> Long = System::currentTimeMillis,
    private val newId: () -> String = { UUID.randomUUID().toString() },
) {
    private val lock = Mutex()

    public suspend fun resume(cmid: String): StoryResumeOutcome {
        if (!lock.tryLock()) return StoryResumeOutcome.Busy
        val batch = File(staging, UUID.randomUUID().toString())
        try {
            val failed = readFailed(cmid) ?: return StoryResumeOutcome.NothingToResume
            val snapshot = snapshotOf(failed) ?: return StoryResumeOutcome.NothingToResume
            if (!batch.isDirectory && !batch.mkdirs()) return StoryResumeOutcome.CopyFailed
            val files = copyNamedMedia(snapshot.slides.flatMap { it.mediaIds }, media, batch) ?: return StoryResumeOutcome.CopyFailed
            val draftId = StoryDraftIndex.freshId(store.listDrafts().mapTo(HashSet()) { it.id }, newId)
            if (!store.save(draftId, snapshot, files)) {
                store.delete(draftId)
                return StoryResumeOutcome.CopyFailed
            }
            if (!isFaithful(draftId, snapshot, files.keys)) {
                store.delete(draftId)
                return StoryResumeOutcome.CopyFailed
            }
            discardFailed(cmid)
            return StoryResumeOutcome.Resumed(draftId)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            return StoryResumeOutcome.CopyFailed
        } finally {
            batch.deleteRecursively()
            lock.unlock()
        }
    }

    private fun snapshotOf(failed: StoryFailedRequest): StoryComposerDraftSnapshot? =
        StoryFailureDraft.snapshotOf(
            slideId = UUID.randomUUID().toString(),
            content = failed.content,
            mediaIds = failed.mediaIds,
            visibility = failed.visibility,
            visibilityUserIds = failed.visibilityUserIds,
            repostOfId = failed.repostOfId,
            nowIso = java.time.Instant.ofEpochMilli(clock()).toString(),
        )

    private fun isFaithful(draftId: String, snapshot: StoryComposerDraftSnapshot, mediaNames: Set<String>): Boolean =
        store.peek(draftId) == snapshot && store.mediaNames(draftId).containsAll(mediaNames)
}
