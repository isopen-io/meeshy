package me.meeshy.sdk.user

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.contacts.ContactRelation
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ContactResolveRequest
import me.meeshy.sdk.net.api.PublicContactAccount

/** Couture du serveur : `POST /contacts/resolve` ne rend que des comptes INSCRITS, avec la relation du lecteur. */
fun interface ContactAccountsSource {
    suspend fun resolve(request: ContactResolveRequest): NetworkResult<List<PublicContactAccount>>
}

/**
 * Rapproche les identifiants d'une carte de visite reçue des comptes Meeshy (miroir de `ContactResolveService`,
 * iOS, #8101). Cache SWR en mémoire : [cached] répond SANS attendre ce qu'une résolution précédente a rendu (une
 * carte déjà résolue s'affiche sans attente) ; [resolve] ne touche le réseau que si l'entrée manque ou est périmée.
 *
 * Rien n'est jamais persisté ni journalisé : le numéro d'un non-inscrit part dans la requête de résolution, que
 * le serveur ne retient pas (#9225) ; seuls les comptes inscrits reviennent. La résolution ne JETTE jamais : un
 * refus ou un réseau absent rend le dernier résultat connu, ou une liste vide — la carte s'affiche alors sans
 * section Meeshy, et un échec n'est pas rejoué avant [failureBackoffMillis].
 */
@Singleton
class ContactCardAccountResolver internal constructor(
    private val source: ContactAccountsSource,
    private val freshnessMillis: Long,
    private val failureBackoffMillis: Long,
    private val capacity: Int,
    private val clock: () -> Long,
) {
    @Inject
    constructor(repository: ContactsBookRepository) : this(
        source = ContactAccountsSource { request ->
            repository.resolveRegistered(request.phones, request.emails, request.defaultCountry)
        },
        freshnessMillis = FRESHNESS_MILLIS,
        failureBackoffMillis = FAILURE_BACKOFF_MILLIS,
        capacity = CAPACITY,
        clock = System::currentTimeMillis,
    )

    private class Entry(val accounts: List<PublicContactAccount>, val storedAt: Long)

    private val lock = Any()
    private val entries = LinkedHashMap<ContactResolveRequest, Entry>()
    private val failures = HashMap<ContactResolveRequest, Long>()

    fun cached(request: ContactResolveRequest): List<PublicContactAccount>? =
        synchronized(lock) { entries[request]?.accounts }

    suspend fun resolve(request: ContactResolveRequest): List<PublicContactAccount> {
        if (request.isEmpty) return emptyList()
        val now = clock()
        synchronized(lock) {
            val entry = entries[request]
            if (entry != null && now - entry.storedAt < freshnessMillis) return entry.accounts
            val failedAt = failures[request]
            if (failedAt != null && now - failedAt < failureBackoffMillis) return entry?.accounts.orEmpty()
        }
        return when (val result = source.resolve(request)) {
            is NetworkResult.Success -> synchronized(lock) {
                failures.remove(request)
                entries.remove(request)
                entries[request] = Entry(result.data, clock())
                while (entries.size > capacity) entries.remove(entries.keys.first())
                result.data
            }
            is NetworkResult.Failure -> synchronized(lock) {
                failures[request] = clock()
                entries[request]?.accounts.orEmpty()
            }
        }
    }

    /** Applique localement un changement de relation (demande envoyée, acceptée) à toute entrée qui porte ce compte. */
    fun updateRelation(userId: String, relation: ContactRelation) = synchronized(lock) {
        entries.keys.toList().forEach { key ->
            val entry = entries.getValue(key)
            if (entry.accounts.none { it.userId == userId }) return@forEach
            entries[key] = Entry(
                entry.accounts.map { if (it.userId == userId) it.copy(relation = relation.wire) else it },
                entry.storedAt,
            )
        }
    }

    /** Déconnexion : les relations résolues (« vous », « ami », « demande envoyée ») sont celles du compte sortant. */
    fun purge() = synchronized(lock) {
        entries.clear()
        failures.clear()
    }

    private companion object {
        const val FRESHNESS_MILLIS = 600_000L
        const val FAILURE_BACKOFF_MILLIS = 120_000L
        const val CAPACITY = 50
    }
}
