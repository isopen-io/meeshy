package me.meeshy.sdk.post

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.comment.CommentDraftBook
import me.meeshy.sdk.session.PerAccountCache

/** Le support durable du carnet de brouillons : une chaîne opaque, `null` = rien. */
public interface CommentDraftStorage {
    public fun read(): String?
    public fun write(raw: String?)
}

/** [CommentDraftStorage] en mémoire — tests et aperçus. */
public class InMemoryCommentDraftStorage(initial: String? = null) : CommentDraftStorage {
    public var raw: String? = initial
        private set
    public var writes: Int = 0
        private set

    override fun read(): String? = raw

    override fun write(raw: String?) {
        this.raw = raw
        writes++
    }
}

/** [CommentDraftStorage] sur des SharedPreferences privées. */
public class SharedPrefsCommentDraftStorage(context: Context) : CommentDraftStorage {
    private val prefs = context.applicationContext.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)

    override fun read(): String? = prefs.getString(KEY, null)

    override fun write(raw: String?) {
        prefs.edit().apply { if (raw == null) remove(KEY) else putString(KEY, raw) }.commit()
    }

    private companion object {
        const val FILE_NAME = "meeshy_comment_drafts"
        const val KEY = "drafts"
    }
}

@Serializable
internal data class CommentDraftEntry(val postId: String, val text: String)

/**
 * Le brouillon de commentaire en cours, par post (iOS `CommentDraftStore`) : un commentaire commencé puis abandonné en
 * quittant le post revient tel quel. Le texte est relu EN MÉMOIRE tout de suite ; l'écriture durable est débouncée de
 * [CommentDraftBook.DEBOUNCE_MS] (le composer appelle [save] à chaque caractère) et immédiate à [flush] (ON_STOP). Un texte
 * vide efface sans attendre : un brouillon fantôme ne ressuscite pas après l'envoi. 50 brouillons au plus, le plus ancien
 * part le premier. Vidé avec le compte ([PerAccountCache]).
 */
public class CommentDraftStore(
    private val storage: CommentDraftStorage,
    private val scope: CoroutineScope,
    private val json: Json = Json,
    private val debounceMs: Long = CommentDraftBook.DEBOUNCE_MS,
) : PerAccountCache {

    private val lock = Any()
    private var book: CommentDraftBook = decode(storage.read())
    private var pending: Job? = null
    private var dirty = false

    public fun load(postId: String): String? = synchronized(lock) { book.load(postId) }

    public fun save(postId: String, text: String) {
        synchronized(lock) {
            val before = book
            book = book.saved(postId, text)
            if (book == before) return
            if (text.isBlank()) {
                pending?.cancel()
                pending = null
                writeNow()
                return
            }
            dirty = true
            pending?.cancel()
            pending = scope.launch {
                delay(debounceMs)
                flush()
            }
        }
    }

    /** Écrit tout brouillon en vol sans attendre (le composer s'arrête, l'app passe en arrière-plan). Idempotent. */
    public fun flush() {
        synchronized(lock) {
            pending?.cancel()
            pending = null
            if (dirty) writeNow()
        }
    }

    public fun clear(postId: String): Unit = save(postId, "")

    override suspend fun clear() {
        synchronized(lock) {
            pending?.cancel()
            pending = null
            book = CommentDraftBook()
            dirty = false
            storage.write(null)
        }
    }

    private fun writeNow() {
        dirty = false
        val entries = book.entries().map { (postId, text) -> CommentDraftEntry(postId, text) }
        storage.write(if (entries.isEmpty()) null else json.encodeToString(ListSerializer(CommentDraftEntry.serializer()), entries))
    }

    private fun decode(raw: String?): CommentDraftBook =
        raw?.let {
            runCatching { json.decodeFromString(ListSerializer(CommentDraftEntry.serializer()), it) }.getOrNull()
        }?.let { entries -> CommentDraftBook.of(entries.map { it.postId to it.text }) } ?: CommentDraftBook()
}
