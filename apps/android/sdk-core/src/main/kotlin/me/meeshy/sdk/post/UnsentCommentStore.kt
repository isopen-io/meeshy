package me.meeshy.sdk.post

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import me.meeshy.sdk.session.PerAccountCache

/**
 * Les commentaires que le serveur a refusés pour de bon APRÈS que l'auteur les a tapés dans une bannière (#13693) : le
 * texte reste ici, sur l'appareil, jusqu'à ce que l'auteur le retrouve dans le champ de commentaire du post
 * ([take]) ou l'abandonne. Un texte par post (le dernier refusé le remplace). Vidé avec le compte
 * ([PerAccountCache]) : un second compte n'hérite jamais des mots du premier.
 */
public interface UnsentCommentStore : PerAccountCache {
    /** Le texte gardé pour [postId], sans le retirer ; `null` si rien n'est gardé. */
    public fun peek(postId: String): String?

    public fun keep(postId: String, text: String)

    /** Rend le texte gardé pour [postId] et le retire : il passe dans le champ de commentaire. */
    public fun take(postId: String): String?

    public val kept: StateFlow<Map<String, String>>
}

/** Volatile [UnsentCommentStore] — for tests and previews. */
public class InMemoryUnsentCommentStore : UnsentCommentStore {
    private val state = MutableStateFlow<Map<String, String>>(emptyMap())
    override val kept: StateFlow<Map<String, String>> = state.asStateFlow()

    override fun peek(postId: String): String? = state.value[postId]

    override fun keep(postId: String, text: String) {
        if (text.isBlank()) return
        state.value = state.value + (postId to text)
    }

    override fun take(postId: String): String? {
        val text = state.value[postId] ?: return null
        state.value = state.value - postId
        return text
    }

    override suspend fun clear() {
        state.value = emptyMap()
    }
}

/** [UnsentCommentStore] on private SharedPreferences: the notification outlives the process, so does the text. */
public class SharedPrefsUnsentCommentStore(
    context: Context,
    private val json: Json,
) : UnsentCommentStore {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)

    private val state = MutableStateFlow(decode(prefs.getString(KEY_ITEMS, null)))
    override val kept: StateFlow<Map<String, String>> = state.asStateFlow()

    override fun peek(postId: String): String? = state.value[postId]

    override fun keep(postId: String, text: String) {
        if (text.isBlank()) return
        write(state.value + (postId to text))
    }

    override fun take(postId: String): String? {
        val text = state.value[postId] ?: return null
        write(state.value - postId)
        return text
    }

    override suspend fun clear() = write(emptyMap())

    @Synchronized
    private fun write(next: Map<String, String>) {
        prefs.edit().putString(KEY_ITEMS, json.encodeToString(SERIALIZER, next)).commit()
        state.value = next
    }

    private fun decode(raw: String?): Map<String, String> =
        raw?.let { runCatching { json.decodeFromString(SERIALIZER, it) }.getOrNull() } ?: emptyMap()

    private companion object {
        private const val FILE_NAME = "meeshy_unsent_comments"
        private const val KEY_ITEMS = "items"
        private val SERIALIZER = MapSerializer(String.serializer(), String.serializer())
    }
}
