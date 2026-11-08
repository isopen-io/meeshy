package me.meeshy.sdk.story

import java.io.File
import java.util.UUID
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.composer.ComposerAutosaveAccount
import me.meeshy.sdk.model.composer.ComposerAutosaveFileName
import me.meeshy.sdk.model.composer.ComposerAutosaveSlot

/** Ce qu'une restauration rend : l'instantané et les fichiers du tiroir, déjà recopiés hors de lui (nom -> copie de session). */
public class ComposerAutosaveRestored(
    public val snapshot: StoryComposerDraftSnapshot,
    public val sessionFileByName: Map<String, File>,
)

/**
 * Le magasin disque des brouillons du composeur (iOS `ComposerAutosaveStore`) :
 * `filesDir/ComposerAutosave/<compte+environnement>/<tiroir>/{snapshot.json, media/}`. Hors du cache (que le système purge)
 * et hors de la sauvegarde cloud (`data_extraction_rules` exclut le domaine `file`). Toutes les méthodes bloquent sur le
 * disque : l'appelant les pose hors du fil principal ; une seule écriture à la fois par magasin.
 */
public interface ComposerAutosaveStoring {
    public fun save(account: ComposerAutosaveAccount, slot: ComposerAutosaveSlot, snapshot: StoryComposerDraftSnapshot, files: Map<String, File>)
    public fun hasDraft(account: ComposerAutosaveAccount, slot: ComposerAutosaveSlot): Boolean
    public fun load(account: ComposerAutosaveAccount, slot: ComposerAutosaveSlot): ComposerAutosaveRestored?
    public fun delete(account: ComposerAutosaveAccount, slot: ComposerAutosaveSlot)
    public fun deleteAll()

    /** Déplace un tiroir ENTIER (instantané et médias), en remplaçant la cible. */
    public fun move(account: ComposerAutosaveAccount, from: ComposerAutosaveSlot, to: ComposerAutosaveSlot)

    /** Les tiroirs de publication acceptée encore présents sous ce compte. */
    public fun publicationSlots(account: ComposerAutosaveAccount): List<ComposerAutosaveSlot>
}

public class ComposerAutosaveDiskStore(
    filesDir: File,
    private val sessionRoot: File,
    private val json: Json,
) : ComposerAutosaveStoring {
    private val root = File(filesDir, ROOT_NAME)
    private val lock = Any()

    private fun directory(account: ComposerAutosaveAccount, slot: ComposerAutosaveSlot) =
        File(File(root, account.directoryName), slot.directoryName)

    override fun save(account: ComposerAutosaveAccount, slot: ComposerAutosaveSlot, snapshot: StoryComposerDraftSnapshot, files: Map<String, File>) {
        synchronized(lock) {
            val dir = directory(account, slot)
            val media = File(dir, MEDIA)
            if (!media.isDirectory && !media.mkdirs()) return@synchronized
            files.forEach { (name, source) ->
                val target = File(media, name)
                if (!target.exists() && source.isFile) runCatching { source.copyTo(target) }
            }
            val encoded = runCatching { json.encodeToString(StoryComposerDraftSnapshot.serializer(), snapshot) }.getOrNull() ?: return@synchronized
            val temp = File(dir, "$SNAPSHOT.tmp")
            val written = runCatching { temp.writeText(encoded); temp.renameTo(File(dir, SNAPSHOT)) }.getOrDefault(false)
            if (written) media.listFiles().orEmpty().filter { it.name !in files.keys }.forEach { it.delete() }
        }
    }

    override fun hasDraft(account: ComposerAutosaveAccount, slot: ComposerAutosaveSlot): Boolean =
        synchronized(lock) { File(directory(account, slot), SNAPSHOT).isFile }

    override fun load(account: ComposerAutosaveAccount, slot: ComposerAutosaveSlot): ComposerAutosaveRestored? = synchronized(lock) {
        val dir = directory(account, slot)
        val raw = runCatching { File(dir, SNAPSHOT).readText() }.getOrNull() ?: return null
        val snapshot = runCatching { json.decodeFromString(StoryComposerDraftSnapshot.serializer(), raw) }.getOrNull() ?: return null
        val session = File(File(sessionRoot, ComposerAutosaveFileName.SESSION_DIRECTORY), UUID.randomUUID().toString())
        session.mkdirs()
        val copies = File(dir, MEDIA).listFiles().orEmpty().filter { it.isFile }.mapNotNull { source ->
            runCatching { source.copyTo(File(session, source.name)) }.getOrNull()?.let { source.name to it }
        }.toMap()
        ComposerAutosaveRestored(snapshot, copies)
    }

    override fun delete(account: ComposerAutosaveAccount, slot: ComposerAutosaveSlot) {
        synchronized(lock) { directory(account, slot).deleteRecursively() }
    }

    override fun deleteAll() {
        synchronized(lock) { root.deleteRecursively() }
    }

    override fun move(account: ComposerAutosaveAccount, from: ComposerAutosaveSlot, to: ComposerAutosaveSlot) {
        synchronized(lock) {
            val source = directory(account, from)
            if (!source.exists()) return
            val target = directory(account, to)
            target.deleteRecursively()
            target.parentFile?.mkdirs()
            if (!source.renameTo(target)) {
                source.copyRecursively(target, overwrite = true)
                source.deleteRecursively()
            }
        }
    }

    override fun publicationSlots(account: ComposerAutosaveAccount): List<ComposerAutosaveSlot> = synchronized(lock) {
        File(root, account.directoryName).list().orEmpty()
            .filter { it.startsWith(ComposerAutosaveSlot.PUBLICATION_PREFIX) }
            .sorted()
            .map(::ComposerAutosaveSlot)
    }

    private companion object {
        const val ROOT_NAME = "ComposerAutosave"
        const val MEDIA = "media"
        const val SNAPSHOT = "snapshot.json"
    }
}
