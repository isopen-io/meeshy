package me.meeshy.sdk.user

import me.meeshy.sdk.model.contacts.ContactMatch
import me.meeshy.sdk.model.contacts.ContactMatchEntry
import me.meeshy.sdk.model.contacts.ContactMatchRequest
import me.meeshy.sdk.model.contacts.ContactSyncBatching
import me.meeshy.sdk.model.contacts.DirectorySyncMode
import me.meeshy.sdk.model.contacts.DirectorySyncRequest
import me.meeshy.sdk.model.contacts.DirectorySyncResult
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ContactDirectoryApi
import me.meeshy.sdk.net.api.ContactMatchApi
import me.meeshy.sdk.net.api.ContactResolveRequest
import me.meeshy.sdk.net.api.ContactsApi
import me.meeshy.sdk.net.api.PublicContactAccount
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Le carnet d'adresses vers la passerelle (port de `ContactSyncService`, iOS).
 *
 * Les fiches arrivent en PARAMETRE : la lecture de l'appareil appartient a l'ecran. Rien n'est
 * persiste ici — ni le carnet, ni les lots : seuls les contacts INSCRITS reviennent du serveur, et
 * le carnet complet n'est jamais conserve en clair cote Android.
 */
@Singleton
class ContactsBookRepository @Inject constructor(
    private val directoryApi: ContactDirectoryApi,
    private val matchApi: ContactMatchApi,
    private val contactsApi: ContactsApi,
) {
    /** Retrouve les inscrits parmi les fiches, en lots bornes ; rien n'est conserve cote serveur. */
    suspend fun findRegistered(
        entries: List<ContactMatchEntry>,
        defaultCountry: String?,
        batchSize: Int = ContactSyncBatching.BATCH_SIZE,
    ): NetworkResult<List<ContactMatch>> {
        val matchable = entries.filter { it.isMatchable }
        if (matchable.isEmpty()) return NetworkResult.Success(emptyList())
        val matches = mutableListOf<ContactMatch>()
        for (batch in ContactSyncBatching.batches(matchable, batchSize)) {
            when (val result = apiCall { matchApi.match(ContactMatchRequest(batch, defaultCountry)) }) {
                is NetworkResult.Failure -> return result
                is NetworkResult.Success -> matches += result.data.matches
            }
        }
        return NetworkResult.Success(matches)
    }

    /** Synchronise TOUT le carnet vers le repertoire ; le verbe porte le mode. */
    suspend fun syncDirectory(
        entries: List<ContactMatchEntry>,
        mode: DirectorySyncMode,
        defaultCountry: String?,
        batchSize: Int = ContactSyncBatching.BATCH_SIZE,
    ): NetworkResult<DirectorySyncResult> {
        var failure: NetworkResult.Failure? = null
        return try {
            NetworkResult.Success(
                ContactSyncBatching.sync(entries.filter { it.isMatchable }, mode, defaultCountry, batchSize) { request ->
                    when (val result = send(request)) {
                        is NetworkResult.Success -> result.data
                        is NetworkResult.Failure -> {
                            failure = result
                            throw SyncAborted()
                        }
                    }
                },
            )
        } catch (aborted: SyncAborted) {
            failure ?: NetworkResult.Failure(ApiError(message = "sync aborted"))
        }
    }

    /** Resout des identifiants par lots bornes (10 par liste) ; seuls les comptes inscrits reviennent. */
    suspend fun resolveRegistered(
        phones: List<String>,
        emails: List<String>,
        defaultCountry: String?,
    ): NetworkResult<List<PublicContactAccount>> {
        val max = ContactResolveRequest.MAX_IDENTIFIERS
        val phoneBatches = phones.distinct().chunked(max)
        val emailBatches = emails.distinct().chunked(max)
        val count = maxOf(phoneBatches.size, emailBatches.size)
        val accounts = LinkedHashMap<String, PublicContactAccount>()
        for (i in 0 until count) {
            val request = ContactResolveRequest.bounded(
                phoneBatches.getOrElse(i) { emptyList() },
                emailBatches.getOrElse(i) { emptyList() },
                defaultCountry,
            )
            if (request.isEmpty) continue
            when (val result = apiCall { contactsApi.resolve(request) }) {
                is NetworkResult.Failure -> return result
                is NetworkResult.Success -> result.data.accounts.forEach { accounts.putIfAbsent(it.userId, it) }
            }
        }
        return NetworkResult.Success(accounts.values.toList())
    }

    private suspend fun send(request: DirectorySyncRequest): NetworkResult<DirectorySyncResult> = apiCall {
        if (request.mode == DirectorySyncMode.Replace) directoryApi.replace(request) else directoryApi.merge(request)
    }

    private class SyncAborted : RuntimeException()
}
