package me.meeshy.sdk.net.api

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.contacts.ContactRelation
import retrofit2.http.Body
import retrofit2.http.POST

/** Corps de `POST /contacts/resolve` : chaque liste bornee a [MAX_IDENTIFIERS], sans doublon, dans l'ordre. */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ContactResolveRequest(
    @EncodeDefault val phones: List<String> = emptyList(),
    @EncodeDefault val emails: List<String> = emptyList(),
    val defaultCountry: String? = null,
) {
    val isEmpty: Boolean get() = phones.isEmpty() && emails.isEmpty()

    companion object {
        const val MAX_IDENTIFIERS = 10

        fun bounded(phones: List<String>, emails: List<String>, defaultCountry: String? = null) =
            ContactResolveRequest(
                phones = bound(phones.map { it.trim() }),
                emails = bound(emails.map { it.trim().lowercase() }),
                defaultCountry = defaultCountry,
            )

        private fun bound(values: List<String>): List<String> =
            values.filter { it.isNotEmpty() }.distinct().take(MAX_IDENTIFIERS)
    }
}

/** Profil PUBLIC d'un compte associe a un numero ou un e-mail : ni e-mail, ni telephone, ni presence. */
@Serializable
data class PublicContactAccount(
    val userId: String,
    val displayName: String = "",
    val username: String = "",
    val avatarUrl: String? = null,
    val bannerUrl: String? = null,
    val bio: String? = null,
    val relation: String? = null,
) {
    val relationState: ContactRelation get() = ContactRelation.fromWire(relation)
}

@Serializable
data class ContactResolveResponse(val accounts: List<PublicContactAccount> = emptyList())

/**
 * `POST /contacts/resolve` (#8101) : le serveur n'y rend que les comptes INSCRITS. Le client n'envoie
 * que des lots bornes et ne conserve jamais le carnet en clair.
 */
interface ContactsApi {
    @POST("contacts/resolve")
    suspend fun resolve(@Body body: ContactResolveRequest): ApiResponse<ContactResolveResponse>
}
