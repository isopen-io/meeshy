package me.meeshy.sdk.user

import android.content.Context
import android.net.Uri
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.contacts.vcard.VCard
import me.meeshy.sdk.model.contacts.vcard.VCardParser
import me.meeshy.sdk.model.fileviewer.BoundedTextReader
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.PerAccountCache
import me.meeshy.sdk.session.commitOrWrite

/** Couture d'ouverture d'un fichier LOCAL (remplacée par les témoins) : `null` = illisible ; un refus du fournisseur (permission, adresse inconnue) aussi. */
internal fun interface LocalFileOpener {
    fun open(uri: String): java.io.InputStream?
}

/**
 * Les cartes de visite DÉJÀ présentes sur l'appareil, lues une fois et gardées en mémoire (miroir de
 * `VCardAttachmentLoader`, iOS). Trois bornes : le fichier (jamais plus de [MAX_CARD_BYTES] en mémoire, un fichier
 * plus gros n'est pas une carte), le cache (au plus [capacity] cartes, la plus ancienne sort) et le compte (un
 * [PerAccountCache] vidé à la fin de session, écrit sous le ticket de [AccountFence]).
 *
 * **Jamais de réseau** : seuls les schémas `content:` et `file:` s'ouvrent, une adresse `http(s)` rend `null` sans
 * rien lire. La lecture et l'analyse se font hors du fil principal.
 */
@Singleton
class VCardCache internal constructor(
    private val opener: LocalFileOpener,
    private val dispatcher: CoroutineDispatcher,
    private val capacity: Int,
    private val fence: AccountFence?,
) : PerAccountCache {

    @Inject
    constructor(@ApplicationContext context: Context, fence: AccountFence) : this(
        opener = LocalFileOpener { uri -> context.contentResolver.openInputStream(Uri.parse(uri)) },
        dispatcher = Dispatchers.IO,
        capacity = CAPACITY,
        fence = fence,
    )

    private val lock = Any()
    private val cards = object : LinkedHashMap<String, VCard>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, VCard>?): Boolean = size > capacity
    }
    private val flights = SingleFlight<String, VCard?>()

    /** La carte déjà lue, sans attendre. */
    fun cached(key: String): VCard? = synchronized(lock) { cards[key] }

    /** La carte du fichier local [uri], ou `null` (pas local, illisible, trop gros, binaire, pas une vCard). */
    suspend fun load(key: String, uri: String): VCard? {
        cached(key)?.let { return it }
        if (!isLocal(uri)) return null
        return flights.run(key) {
            val ticket = fence?.currentTicket()
            val card = withContext(dispatcher) { read(uri) }
            if (card == null) return@run null
            fence.commitOrWrite(ticket) { synchronized(lock) { cards[key] = card }; card }
        }
    }

    private fun read(uri: String): VCard? = try {
        val stream = opener.open(uri) ?: return null
        val read = stream.use { BoundedTextReader.read(it, MAX_CARD_BYTES) }
        if (read.isBinary || read.truncated) null else VCardParser.parse(read.text)
    } catch (_: IOException) {
        null
    } catch (_: RuntimeException) {
        null
    }

    private fun isLocal(uri: String): Boolean {
        val scheme = uri.substringBefore(':', "").lowercase()
        return scheme == "content" || scheme == "file"
    }

    override suspend fun clear() = synchronized(lock) { cards.clear() }

    companion object {
        /** Une carte de visite pèse quelques Ko ; au-delà, ce n'est plus une carte. */
        const val MAX_CARD_BYTES: Int = 256 * 1024
        private const val CAPACITY = 100
    }
}
