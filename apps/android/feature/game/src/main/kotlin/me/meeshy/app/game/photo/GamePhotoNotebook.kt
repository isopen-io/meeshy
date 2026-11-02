package me.meeshy.app.game.photo

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.game.photo.GamePhotoMoment
import me.meeshy.sdk.model.game.photo.GamePhotoNotebookIndex
import me.meeshy.sdk.model.game.photo.NotebookEntry
import me.meeshy.sdk.model.game.photo.NotebookKeepOutcome
import me.meeshy.sdk.model.game.photo.NotebookRecipe
import me.meeshy.sdk.model.game.photo.PhotoMode
import me.meeshy.sdk.session.SessionRepository

/** Ce qu'on garde d'une photo (#10161) : l'image 9:16 composée, sa source réduite (jamais pour une carte seule), sa recette. */
class KeptPhoto(val story: ByteArray, val mode: PhotoMode, val source: ByteArray? = null, val recipe: NotebookRecipe = NotebookRecipe())

/**
 * LA CHRONIQUE DE L'APPAREIL (iOS `GamePhotoNotebooking`) — « la photo reste sur l'appareil tant qu'on ne la partage
 * pas » : aucune image n'est jamais envoyée au serveur.
 */
interface GamePhotoNotebooking {
    /** « Plus tard » : le moment attend, sans échéance. Une étape de piste ne s'y écrit pas : elle se rattrape. */
    suspend fun postpone(moment: GamePhotoMoment): Boolean
    suspend fun keep(moment: GamePhotoMoment, photo: KeptPhoto): NotebookKeepOutcome
    /** La plus récente d'abord ; un disque refusé se lit « Chronique vide », jamais une erreur. */
    suspend fun list(): List<NotebookEntry>
    suspend fun remove(momentId: String): Boolean
    suspend fun storyBytes(entry: NotebookEntry): ByteArray?
    /** La place qu'occupent les images, en octets. */
    suspend fun occupiedBytes(): Long
}

/**
 * Miroir de `GamePhotoNotebook` (iOS) : `files/MeeshyGame/<compte>/Notebook`, un `index.json` et les images. La loi
 * ([GamePhotoNotebookIndex]) dit quoi écrire ; ce carnet l'exécute, hors du fil principal, et UN verrou par dossier
 * sérialise lecture-modification-écriture de l'index — deux gestes concurrents ne se perdent plus l'un l'autre.
 *
 * Les fichiers s'écrivent À CÔTÉ (`.<nom>.writing`), puis l'index, puis ils prennent leur place : un échec avant l'index
 * ne laisse ni entrée ni fichier, et une reprise ratée laisse la photo précédente intacte. Un disque plein se distingue
 * (« Plus de place sur cet appareil ») d'un refus.
 */
class GamePhotoNotebook(
    private val directory: File,
    private val now: () -> Long = System::currentTimeMillis,
    private val write: (ByteArray, File) -> Unit = { bytes, file -> file.writeBytes(bytes) },
    private val io: CoroutineDispatcher = Dispatchers.IO,
) : GamePhotoNotebooking {

    private val lock: Mutex = locks.getOrPut(directory.absolutePath) { Mutex() }
    private val index: File get() = File(directory, INDEX)

    override suspend fun postpone(moment: GamePhotoMoment): Boolean = locked {
        runCatching {
            val next = GamePhotoNotebookIndex.postpone(read(), moment, now()) ?: return@runCatching true
            writeIndex(next)
            true
        }.getOrDefault(false)
    }

    override suspend fun keep(moment: GamePhotoMoment, photo: KeptPhoto): NotebookKeepOutcome = locked {
        val entry = GamePhotoNotebookIndex.keptEntry(moment, photo.mode, photo.source != null, photo.recipe, now())
        val writes = listOfNotNull(
            entry.storyFile?.let { it to photo.story },
            entry.sourceFile?.let { name -> photo.source?.let { name to it } },
        )
        val staged = mutableListOf<Pair<File, File>>()
        try {
            directory.mkdirs()
            writes.forEach { (name, bytes) ->
                val temp = File(directory, ".$name.writing")
                write(bytes, temp)
                staged += temp to File(directory, name)
            }
            val plan = GamePhotoNotebookIndex.keep(read(), entry)
            writeIndex(plan.entries)
            staged.forEach { (temp, final) -> if (!temp.renameTo(final)) throw IOException("rename ${final.name}") }
            plan.obsoleteFiles.forEach { File(directory, it).delete() }
            NotebookKeepOutcome.Kept
        } catch (failure: IOException) {
            staged.forEach { (temp, _) -> temp.delete() }
            outcome(failure)
        } catch (failure: RuntimeException) {
            staged.forEach { (temp, _) -> temp.delete() }
            NotebookKeepOutcome.Unavailable
        }
    }

    override suspend fun list(): List<NotebookEntry> = locked {
        runCatching { GamePhotoNotebookIndex.sorted(read()) }.getOrDefault(emptyList())
    }

    override suspend fun remove(momentId: String): Boolean = locked {
        runCatching {
            val plan = GamePhotoNotebookIndex.remove(read(), momentId) ?: return@runCatching true
            writeIndex(plan.entries)
            plan.obsoleteFiles.forEach { File(directory, it).delete() }
            true
        }.getOrDefault(false)
    }

    override suspend fun storyBytes(entry: NotebookEntry): ByteArray? = withContext(io) {
        entry.storyFile?.let { runCatching { File(directory, it).readBytes() }.getOrNull() }
    }

    override suspend fun occupiedBytes(): Long = locked {
        runCatching { read().flatMap { it.files }.sumOf { File(directory, it).length() } }.getOrDefault(0L)
    }

    private suspend fun <T> locked(body: () -> T): T = withContext(io) { lock.withLock { body() } }

    private fun read(): List<NotebookEntry> = if (index.exists()) GamePhotoNotebookIndex.decode(index.readText()) else emptyList()

    private fun writeIndex(entries: List<NotebookEntry>) {
        directory.mkdirs()
        val temp = File(directory, ".$INDEX.writing")
        write(GamePhotoNotebookIndex.encode(entries).toByteArray(), temp)
        if (!temp.renameTo(index)) {
            temp.delete()
            throw IOException("rename $INDEX")
        }
    }

    companion object {
        private const val INDEX = "index.json"
        private val locks = ConcurrentHashMap<String, Mutex>()

        /** Un disque plein se DESSINE ; tout autre refus se dit « non gardée ». */
        fun outcome(failure: Throwable): NotebookKeepOutcome {
            val text = generateSequence(failure) { it.cause }.mapNotNull { it.message }.joinToString(" ")
            return if ("ENOSPC" in text || "No space left" in text) NotebookKeepOutcome.NoSpace else NotebookKeepOutcome.Unavailable
        }

        /** Le dossier du jeu d'un compte : `files/MeeshyGame/<compte>/Notebook`. */
        fun folder(filesDir: File, userId: String?): File {
            val account = userId?.takeIf { it.isNotBlank() }?.let(GamePhotoNotebookIndex::sanitized) ?: "anonymous"
            return File(File(File(filesDir, "MeeshyGame"), account), "Notebook")
        }
    }
}

/** La Chronique du compte connecté, reconstruite à chaque ouverture ; les carnets d'un même dossier partagent le verrou. */
@Singleton
class GamePhotoNotebooks @Inject constructor(
    @ApplicationContext private val context: Context,
    private val session: SessionRepository,
) {
    fun current(): GamePhotoNotebooking = GamePhotoNotebook(GamePhotoNotebook.folder(context.filesDir, session.currentUserId))
}
