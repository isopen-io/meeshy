package me.meeshy.sdk.model.contacts

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.ServedProfileDecor

/**
 * Un contact du carnet d'adresses, reduit aux identifiants utiles au rapprochement
 * (miroir de `ContactMatchEntry`, iOS). Les trois listes partent TOUJOURS, vides
 * comprises : `MeeshyApi.json` n'ecrit pas les valeurs par defaut, d'ou
 * `@EncodeDefault` — la passerelle exige les trois tableaux.
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ContactMatchEntry(
    val displayName: String? = null,
    @EncodeDefault val phoneNumbers: List<String> = emptyList(),
    @EncodeDefault val emails: List<String> = emptyList(),
    /** Pseudos portes par la fiche (surnom, profils sociaux) : troisieme identifiant de rapprochement. */
    @EncodeDefault val usernames: List<String> = emptyList(),
) {
    /** Une fiche sans numero, e-mail ni pseudo ne peut etre rapprochee de rien. */
    val isMatchable: Boolean get() = phoneNumbers.isNotEmpty() || emails.isNotEmpty() || usernames.isNotEmpty()
}

@Serializable
data class ContactMatchRequest(
    val contacts: List<ContactMatchEntry>,
    val defaultCountry: String? = null,
)

/**
 * Profil public d'un contact retrouve sur la plateforme (miroir de `MatchedContactUser`).
 * Les dates restent la chaine du fil ; la presence est ce que le serveur a servi, rien de plus.
 */
@Serializable
data class MatchedContactUser(
    val id: String,
    val username: String,
    val firstName: String? = null,
    val lastName: String? = null,
    val displayName: String? = null,
    val avatar: String? = null,
    val isOnline: Boolean? = null,
    val lastActiveAt: String? = null,
    val profileDecor: ServedProfileDecor? = null,
)

@Serializable
data class ContactMatch(
    val user: MatchedContactUser,
    val matchedBy: String = "phone",
    val contactDisplayName: String? = null,
) {
    val id: String get() = user.id
}

@Serializable
data class ContactMatchResponse(
    val matches: List<ContactMatch> = emptyList(),
    val totalContacts: Int = 0,
    val matchedCount: Int = 0,
)
