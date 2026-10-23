package me.meeshy.sdk.audioedit

import java.io.File
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.audioedit.AudioEditDocument
import me.meeshy.sdk.model.audioedit.AudioEditError
import me.meeshy.sdk.model.audioedit.AudioEditOperation
import me.meeshy.sdk.model.audioedit.AudioEditPlan
import me.meeshy.sdk.model.audioedit.AudioEditVersion

/** Lit la durée réelle d'un fichier audio, en secondes ; `null` = inconnue. */
public fun interface AudioDurationReader {
    public fun read(file: File): Double?
}

/**
 * L'audio confirmé. Compatibilité des sites d'appel : `trimStartSeconds` vaut toujours 0 et
 * `trimEndSeconds` la durée finale, puisque le rognage est déjà cuit dans le fichier.
 */
public data class AudioEditResult(
    val file: File,
    val durationSeconds: Double,
    val trimStartSeconds: Double = 0.0,
    val trimEndSeconds: Double = durationSeconds,
)

/**
 * Une session d'édition : copie la source dans un dossier privé du cache, applique les
 * opérations par le [AudioEditEngine], tient le [AudioEditDocument] et son manifeste de
 * reprise. Les versions temporaires ne disparaissent qu'au [confirm] ou au [discard].
 */
public class AudioEditSession private constructor(
    private val engine: AudioEditEngine,
    private val durations: AudioDurationReader,
    private val ioDispatcher: CoroutineDispatcher,
    private val clock: () -> Long,
    public val sessionDirectory: File,
    initial: AudioEditDocument,
) {
    private val state = MutableStateFlow(initial)
    private val gate = Mutex()

    public val document: StateFlow<AudioEditDocument> = state.asStateFlow()

    public val activeFile: File get() = File(sessionDirectory, state.value.active.fileName)

    /**
     * Applique [operation] à la version active et la valide. Une identité ne produit rien.
     * Rend le document courant ; lève une [AudioEditError] typée (le document reste inchangé).
     */
    public suspend fun apply(operation: AudioEditOperation): AudioEditDocument = gate.withLock {
        if (operation.isIdentity) return@withLock state.value
        val current = state.value
        val rendered = engine.apply(operation, activeFile, current.active.durationSeconds, sessionDirectory)
        val duration = withContext(ioDispatcher) { durations.read(rendered) }
            ?: AudioEditPlan.lower(operation, current.active.durationSeconds).finalDuration
        val version = AudioEditVersion(
            id = UUID.randomUUID().toString(),
            fileName = rendered.name,
            durationSeconds = duration,
            operation = operation,
            createdAtMillis = clock(),
        )
        val commit = current.commit(version)
        publish(commit.document)
        deleteFiles(commit.discarded.map { it.fileName })
        commit.document
    }

    public suspend fun undo(): AudioEditDocument = publish(state.value.undo())

    public suspend fun redo(): AudioEditDocument = publish(state.value.redo())

    public suspend fun selectVersion(versionId: String): AudioEditDocument =
        publish(state.value.moveCursor(versionId))

    /** Copie la version active hors de la session dans [outputDirectory], puis efface la session. */
    public suspend fun confirm(outputDirectory: File): AudioEditResult = gate.withLock {
        withContext(ioDispatcher) {
            val active = state.value.active
            val source = File(sessionDirectory, active.fileName)
            val extension = source.extension.ifEmpty { "m4a" }
            outputDirectory.mkdirs()
            val exported = File(outputDirectory, "edited_audio_${UUID.randomUUID()}.$extension")
            val copied = runCatching { source.copyTo(exported, overwrite = true) }.isSuccess
            val result = AudioEditResult(if (copied) exported else source, active.durationSeconds)
            if (copied) sessionDirectory.deleteRecursively()
            result
        }
    }

    /** Abandonne la session et efface tous ses fichiers temporaires. */
    public suspend fun discard() {
        withContext(ioDispatcher) { sessionDirectory.deleteRecursively() }
    }

    private suspend fun publish(document: AudioEditDocument): AudioEditDocument {
        state.value = document
        withContext(ioDispatcher) {
            runCatching { File(sessionDirectory, MANIFEST_NAME).writeText(document.toManifestJson()) }
        }
        return document
    }

    private suspend fun deleteFiles(names: List<String>) {
        withContext(ioDispatcher) { names.forEach { File(sessionDirectory, it).delete() } }
    }

    public companion object {
        private const val MANIFEST_NAME = "manifest.json"
        private const val STALE_AFTER_MS = 24L * 60 * 60 * 1000

        /**
         * Ouvre une session : copie [source] dans `<root>/<id>/` hors du fil principal, lit sa
         * durée, écrit le manifeste et purge les sessions abandonnées depuis plus de 24 h.
         */
        public suspend fun open(
            source: File,
            root: File,
            engine: AudioEditEngine,
            durations: AudioDurationReader,
            ioDispatcher: CoroutineDispatcher,
            clock: () -> Long = System::currentTimeMillis,
        ): AudioEditSession {
            val id = UUID.randomUUID().toString()
            val directory = File(root, id)
            val document = withContext(ioDispatcher) {
                purgeStale(root, keeping = id, now = clock())
                if (!directory.mkdirs() && !directory.isDirectory) throw AudioEditError.SourceUnreadable
                val name = "original.${source.extension.ifEmpty { "m4a" }}"
                try {
                    source.copyTo(File(directory, name), overwrite = true)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    directory.deleteRecursively()
                    throw AudioEditError.SourceUnreadable
                }
                val duration = durations.read(File(directory, name)) ?: 0.0
                AudioEditDocument(
                    id,
                    AudioEditVersion(
                        id = UUID.randomUUID().toString(),
                        fileName = name,
                        durationSeconds = duration,
                        operation = AudioEditOperation.Original,
                        createdAtMillis = clock(),
                    ),
                )
            }
            val session = AudioEditSession(engine, durations, ioDispatcher, clock, directory, document)
            session.publish(document)
            return session
        }

        internal fun purgeStale(root: File, keeping: String, now: Long) {
            root.listFiles()?.filter { it.isDirectory && it.name != keeping }?.forEach { dir ->
                if (now - dir.lastModified() > STALE_AFTER_MS) dir.deleteRecursively()
            }
        }
    }
}
