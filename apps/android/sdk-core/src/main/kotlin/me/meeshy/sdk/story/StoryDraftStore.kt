package me.meeshy.sdk.story

import java.io.File
import java.util.UUID
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryDraftMeta
import me.meeshy.sdk.model.StoryDraftPersistFailure
import me.meeshy.sdk.model.StoryDraftSummary
import me.meeshy.sdk.model.composer.ComposerAutosaveFileName

/** Un brouillon relu : l'instantané et ses médias, déjà recopiés hors du tiroir (nom -> copie de session). */
public class StoryDraftRestored(
    public val snapshot: StoryComposerDraftSnapshot,
    public val sessionFileByName: Map<String, File>,
)

/**
 * Les brouillons de story, PLUSIEURS à la fois, chacun sous son `draftId` (iOS `StoryDraftStore`) :
 * `filesDir/StoryDrafts/<draftId>/{draft.json, meta.json, history.bin, media/}`. Deux brouillons peuvent partager un
 * `element_id` sans se toucher : chacun a son sous-répertoire. Toutes les méthodes bloquent sur le disque (hors fil principal).
 */
public interface StoryDraftStoring {
    /** Écrit le brouillon en bloc : médias d'abord, puis l'instantané, puis la fiche — chacun par renommage atomique. */
    public fun save(
        draftId: String,
        snapshot: StoryComposerDraftSnapshot,
        files: Map<String, File>,
        imageFileNames: List<String> = files.keys.filter { looksLikeImage(it) },
        thumbHash: String? = null,
    ): Boolean

    public fun load(draftId: String): StoryDraftRestored?

    /** L'instantané rangé, sans recopier aucun média (une vérification, pas une ouverture). */
    public fun peek(draftId: String): StoryComposerDraftSnapshot?

    /** Les noms des médias rangés dans le tiroir du brouillon. */
    public fun mediaNames(draftId: String): Set<String>

    /** Du plus récemment modifié au plus ancien ; ne lit que les fiches. */
    public fun listDrafts(): List<StoryDraftSummary>

    public fun isEmpty(): Boolean
    public fun delete(draftId: String): Boolean
    public fun clear(): Boolean

    public fun saveCommandHistory(draftId: String, data: ByteArray): Boolean
    public fun loadCommandHistory(draftId: String): ByteArray?

    /** Gèle le brouillon : une publication part pour lui ; la nouvelle tentative supplante l'erreur précédente. */
    public fun markPendingPublish(draftId: String, atMillis: Long): Boolean
    public fun recordPublishFailure(draftId: String, message: String): Boolean
    public fun clearPendingPublish(draftId: String): Boolean
    public fun draftEditingPostId(draftId: String): String?

    /** Retire des slides (et des annotations) les médias dont le fichier est perdu. */
    public fun purgeLostMedia(draftId: String, lostMediaIds: Set<String>): Boolean

    public val lastPersistFailure: StoryDraftPersistFailure?
    public fun clearPersistFailure()

    public companion object {
        public fun newDraftId(): String = UUID.randomUUID().toString()
    }
}

internal fun looksLikeImage(name: String): Boolean =
    name.substringAfterLast('.', "").lowercase() in setOf("jpg", "jpeg", "png", "webp", "heic", "gif")

public class StoryDraftDiskStore(
    filesDir: File,
    private val sessionRoot: File,
    private val json: Json,
    private val clock: () -> Long = System::currentTimeMillis,
) : StoryDraftStoring {
    private val root = File(filesDir, ROOT_NAME)
    private val lock = Any()

    @Volatile
    override var lastPersistFailure: StoryDraftPersistFailure? = null
        private set

    override fun clearPersistFailure() {
        lastPersistFailure = null
    }

    private fun isValidId(draftId: String) =
        draftId.isNotEmpty() && draftId.all { it.isLetterOrDigit() || it == '-' || it == '_' }

    private fun dir(draftId: String): File {
        require(isValidId(draftId)) { "invalid draft id" }
        return File(root, draftId)
    }

    private fun media(draftId: String) = File(dir(draftId), MEDIA)

    private fun fail(operation: String, draftId: String, error: Throwable): Boolean {
        lastPersistFailure = StoryDraftPersistFailure(
            operation = operation,
            message = error.message ?: error.javaClass.simpleName,
            occurredAtMillis = clock(),
            draftWasEverWritten = isValidId(draftId) && File(dir(draftId), DRAFT).isFile,
        )
        return false
    }

    private fun mediaTarget(mediaDir: File, name: String): File {
        require(name.isNotEmpty() && name != "." && name != ".." && '/' !in name && '\\' !in name) { "invalid media name" }
        return File(mediaDir, name)
    }

    private fun readSnapshot(draftId: String): StoryComposerDraftSnapshot? {
        if (!isValidId(draftId)) return null
        val raw = runCatching { File(dir(draftId), DRAFT).readText() }.getOrNull() ?: return null
        return runCatching { json.decodeFromString(StoryComposerDraftSnapshot.serializer(), raw) }.getOrNull()
    }

    private fun writeAtomically(target: File, bytes: ByteArray) {
        target.parentFile?.mkdirs()
        val temp = File(target.parentFile, target.name + ".tmp")
        temp.writeBytes(bytes)
        if (!temp.renameTo(target)) {
            temp.copyTo(target, overwrite = true)
            temp.delete()
        }
    }

    private fun readMeta(draftId: String): StoryDraftMeta? {
        if (!isValidId(draftId)) return null
        return runCatching { json.decodeFromString(StoryDraftMeta.serializer(), File(dir(draftId), META).readText()) }.getOrNull()
    }

    private fun writeMeta(draftId: String, meta: StoryDraftMeta) =
        writeAtomically(File(dir(draftId), META), json.encodeToString(StoryDraftMeta.serializer(), meta).encodeToByteArray())

    override fun save(
        draftId: String,
        snapshot: StoryComposerDraftSnapshot,
        files: Map<String, File>,
        imageFileNames: List<String>,
        thumbHash: String?,
    ): Boolean = synchronized(lock) {
        runCatching {
            val mediaDir = media(draftId)
            if (!mediaDir.isDirectory && !mediaDir.mkdirs()) error("media directory unavailable")
            val targets = files.mapValues { (name, _) -> mediaTarget(mediaDir, name) }
            files.forEach { (name, source) ->
                val target = targets.getValue(name)
                if (!target.exists() && source.isFile) source.copyTo(target)
            }
            val encoded = json.encodeToString(StoryComposerDraftSnapshot.serializer(), snapshot)
            writeAtomically(File(dir(draftId), DRAFT), encoded.encodeToByteArray())
            writeMeta(draftId, StoryDraftMeta.of(snapshot, clock(), imageFileNames, thumbHash, readMeta(draftId)))
            mediaDir.listFiles().orEmpty().filter { it.name !in files.keys }.forEach { it.delete() }
            true
        }.getOrElse { fail("save", draftId, it) }
    }

    override fun load(draftId: String): StoryDraftRestored? = synchronized(lock) {
        val snapshot = readSnapshot(draftId) ?: return null
        val session = File(File(sessionRoot, ComposerAutosaveFileName.SESSION_DIRECTORY), UUID.randomUUID().toString())
        session.mkdirs()
        val copies = media(draftId).listFiles().orEmpty().filter { it.isFile }.mapNotNull { source ->
            runCatching { source.copyTo(File(session, source.name)) }.getOrNull()?.let { source.name to it }
        }.toMap()
        StoryDraftRestored(snapshot, copies)
    }

    override fun peek(draftId: String): StoryComposerDraftSnapshot? = synchronized(lock) { readSnapshot(draftId) }

    override fun mediaNames(draftId: String): Set<String> = synchronized(lock) {
        if (!isValidId(draftId)) return emptySet()
        media(draftId).listFiles().orEmpty().filter { it.isFile }.mapTo(mutableSetOf()) { it.name }
    }

    override fun listDrafts(): List<StoryDraftSummary> = synchronized(lock) {
        root.list().orEmpty().filter { isValidId(it) }.mapNotNull { id ->
            readMeta(id)?.toSummary(id, media(id).path) { File(it).isFile }
        }.sortedByDescending { it.updatedAtMillis }
    }

    override fun isEmpty(): Boolean = listDrafts().isEmpty()

    override fun delete(draftId: String): Boolean = synchronized(lock) {
        if (!isValidId(draftId)) return false
        runCatching { dir(draftId).deleteRecursively() }.getOrElse { fail("delete", draftId, it) }
    }

    override fun clear(): Boolean = synchronized(lock) {
        runCatching { root.deleteRecursively() }.getOrDefault(false)
    }

    override fun saveCommandHistory(draftId: String, data: ByteArray): Boolean = synchronized(lock) {
        if (!isValidId(draftId) || !File(dir(draftId), DRAFT).isFile) return false
        runCatching { writeAtomically(File(dir(draftId), HISTORY), data); true }.getOrElse { fail("save-history", draftId, it) }
    }

    override fun loadCommandHistory(draftId: String): ByteArray? = synchronized(lock) {
        if (!isValidId(draftId)) return null
        runCatching { File(dir(draftId), HISTORY).readBytes() }.getOrNull()
    }

    private fun updateMeta(operation: String, draftId: String, change: (StoryDraftMeta) -> StoryDraftMeta): Boolean = synchronized(lock) {
        val meta = readMeta(draftId) ?: return false
        runCatching { writeMeta(draftId, change(meta)); true }.getOrElse { fail(operation, draftId, it) }
    }

    override fun markPendingPublish(draftId: String, atMillis: Long): Boolean =
        updateMeta("mark-pending-publish", draftId) { it.copy(pendingPublishAtMillis = atMillis, lastPublishError = null) }

    override fun recordPublishFailure(draftId: String, message: String): Boolean =
        updateMeta("record-publish-failure", draftId) { it.copy(pendingPublishAtMillis = null, lastPublishError = message) }

    override fun clearPendingPublish(draftId: String): Boolean =
        updateMeta("clear-pending-publish", draftId) { it.copy(pendingPublishAtMillis = null) }

    override fun draftEditingPostId(draftId: String): String? = synchronized(lock) { readMeta(draftId)?.editingPostId }

    override fun purgeLostMedia(draftId: String, lostMediaIds: Set<String>): Boolean = synchronized(lock) {
        if (lostMediaIds.isEmpty()) return true
        val snapshot = readSnapshot(draftId) ?: return false
        val kept = snapshot.slides.map { slide ->
            slide.copy(
                mediaIds = slide.mediaIds.filterNot { it in lostMediaIds },
                backgroundMediaId = slide.backgroundMediaId?.takeUnless { it in lostMediaIds },
                placedMedia = slide.placedMedia.filterNot { it.id in lostMediaIds },
            )
        }
        val present = kept.flatMap { it.mediaIds }.toSet()
        val purged = snapshot.copy(slides = kept, annotations = snapshot.annotations.keepingMedia(present))
        runCatching {
            writeAtomically(File(dir(draftId), DRAFT), json.encodeToString(StoryComposerDraftSnapshot.serializer(), purged).encodeToByteArray())
            true
        }.getOrElse { fail("purge-lost-media", draftId, it) }
    }

    private companion object {
        const val ROOT_NAME = "StoryDrafts"
        const val MEDIA = "media"
        const val DRAFT = "draft.json"
        const val META = "meta.json"
        const val HISTORY = "history.bin"
    }
}
