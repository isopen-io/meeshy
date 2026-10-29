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
import me.meeshy.sdk.model.contacts.vcard.VCardParser
import me.meeshy.sdk.model.fileviewer.BoundedTextReader
import me.meeshy.sdk.net.api.ContactResolveRequest
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.PerAccountCache
import me.meeshy.sdk.session.commitOrWrite

/** Couture d'ouverture d'un fichier LOCAL (remplacée par les témoins) : `null` = illisible ; un refus du fournisseur (permission, adresse inconnue) aussi. */
internal fun interface LocalFileOpener {
    fun open(uri: String): java.io.InputStream?
}

/**
 * Ce qu'une carte de visite donne à rapprocher : ses numéros et e-mails, déjà bornés (au plus
 * [ContactResolveRequest.MAX_IDENTIFIERS] de chaque). C'est tout ce que le cache garde d'une carte — le reste de la
 * vCard (photo, notes, adresses) ne sert à aucune rangée et ne reste pas en mémoire.
 */
class CardIdentifiers internal constructor(val phones: List<String>, val emails: List<String>) {
    val isEmpty: Boolean get() = phones.isEmpty() && emails.isEmpty()

    fun request(defaultCountry: String?): ContactResolveRequest = ContactResolveRequest.bounded(phones, emails, defaultCountry)
}

/**
 * Les cartes de visite DÉJÀ présentes sur l'appareil, lues une fois, dont seuls les identifiants bornés
 * ([CardIdentifiers]) restent en mémoire (miroir de `VCardAttachmentLoader`, iOS). Trois bornes : le fichier (jamais
 * plus de [MAX_CARD_BYTES] en mémoire le temps de la lecture, un fichier plus gros n'est pas une carte), le cache (au
 * plus [capacity] cartes, la plus ancienne sort) et le compte (un [PerAccountCache] vidé à la fin de session, écrit
 * sous le ticket de [AccountFence]).
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
    private val cards = object : LinkedHashMap<String, CardIdentifiers>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, CardIdentifiers>?): Boolean = size > capacity
    }
    private val flights = SingleFlight<String, CardIdentifiers?>()

    /** Les identifiants de la carte déjà lue, sans attendre. */
    fun cached(key: String): CardIdentifiers? = synchronized(lock) { cards[key] }

    /** Les identifiants de la carte du fichier local [uri], ou `null` (pas local, illisible, trop gros, binaire, pas une vCard). */
    suspend fun load(key: String, uri: String): CardIdentifiers? {
        cached(key)?.let { return it }
        if (!isLocal(uri)) return null
        return flights.run(key) {
            val ticket = fence?.currentTicket()
            val identifiers = withContext(dispatcher) { read(uri) }
            if (identifiers == null) return@run null
            fence.commitOrWrite(ticket) { synchronized(lock) { cards[key] = identifiers }; identifiers }
        }
    }

    private fun read(uri: String): CardIdentifiers? = try {
        val stream = opener.open(uri) ?: return null
        val read = stream.use { BoundedTextReader.read(it, MAX_CARD_BYTES) }
        if (read.isBinary || read.truncated) null else VCardParser.parse(read.text)?.let(::identifiersOf)
    } catch (_: IOException) {
        null
    } catch (_: RuntimeException) {
        null
    }

    private fun identifiersOf(card: me.meeshy.sdk.model.contacts.vcard.VCard): CardIdentifiers {
        val bounded = ContactResolveRequest.bounded(card.phones.map { it.value }, card.emails.map { it.value })
        return CardIdentifiers(bounded.phones, bounded.emails)
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
