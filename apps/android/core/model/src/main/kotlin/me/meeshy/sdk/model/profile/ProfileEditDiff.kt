package me.meeshy.sdk.model.profile

import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UpdateProfileRequest

/** Les tampons bruts de l'éditeur de profil, tels que tapés ou choisis. */
data class ProfileEditBuffers(
    val firstName: String = "",
    val lastName: String = "",
    val displayName: String = "",
    val bio: String = "",
    val systemLanguage: String = "",
    val regionalLanguage: String = "",
    val customDestinationLanguage: String = "",
)

/**
 * La loi « seuls les champs modifiés partent » (iOS `ProfileView.changedOrNil`).
 *
 * Chaque champ se compare au CLICHÉ D'ORIGINE, jamais à « est-il vide ? » : un champ identique à
 * l'original est omis (`null`), y compris un champ déjà vide — jamais un « effacement de rien ».
 * Trois champs acceptent l'effacement côté passerelle (`updateUserProfileSchema`) : la bio
 * (`z.string().max(500)`), la langue régionale et la langue personnalisée (`z.literal('')`). Les
 * vider envoie la chaîne vide. Prénom, nom, nom affiché et langue principale n'ont pas de forme
 * vide valide : vidés, ils restent omis.
 */
object ProfileEditDiff {

    /** Le plafond de la bio, celui du schéma de la passerelle. */
    const val BIO_MAX_LENGTH: Int = 500

    private val LANGUAGE_CODE = Regex("^[a-z]{2,3}$")

    /** `null` quand [current] vaut l'original (absent = vide), sinon [current] tel quel, vide compris. */
    fun changedOrNil(current: String, original: String?): String? =
        if (current == (original ?: "")) null else current

    /** La bio telle qu'elle peut partir : sans espaces de bord, plafonnée à [BIO_MAX_LENGTH]. */
    fun clampBio(raw: String): String = raw.trim().take(BIO_MAX_LENGTH)

    /**
     * Ramène un code de langue à sa langue primaire (`fr-FR` -> `fr`, `PT_br` -> `pt`). Rend `""` pour
     * un code vide (« aucune ») et `null` pour un code invalide, qui ne doit jamais partir.
     */
    fun normalizeLanguage(raw: String?): String? {
        val trimmed = raw?.trim().orEmpty()
        if (trimmed.isEmpty()) return ""
        val primary = trimmed.substringBefore('-').substringBefore('_').lowercase()
        return primary.takeIf { LANGUAGE_CODE.matches(it) }
    }

    /** La requête qui ne porte que ce qui a changé par rapport à [original]. */
    fun request(original: MeeshyUser?, buffers: ProfileEditBuffers): UpdateProfileRequest =
        UpdateProfileRequest(
            firstName = requiredText(buffers.firstName, original?.firstName),
            lastName = requiredText(buffers.lastName, original?.lastName),
            displayName = requiredText(buffers.displayName, original?.displayName),
            bio = changedOrNil(clampBio(buffers.bio), original?.bio?.trim()),
            systemLanguage = requiredLanguage(buffers.systemLanguage, original?.systemLanguage),
            regionalLanguage = clearableLanguage(buffers.regionalLanguage, original?.regionalLanguage),
            customDestinationLanguage = clearableLanguage(
                buffers.customDestinationLanguage,
                original?.customDestinationLanguage,
            ),
        )

    /**
     * Fusionne deux éditions encore en attente : un champ de [newer] l'emporte, un champ qu'il omet
     * garde celui de [older]. Une édition remplacée dans la file ne perd ainsi aucun champ.
     */
    fun combine(older: UpdateProfileRequest, newer: UpdateProfileRequest): UpdateProfileRequest =
        UpdateProfileRequest(
            firstName = newer.firstName ?: older.firstName,
            lastName = newer.lastName ?: older.lastName,
            displayName = newer.displayName ?: older.displayName,
            bio = newer.bio ?: older.bio,
            systemLanguage = newer.systemLanguage ?: older.systemLanguage,
            regionalLanguage = newer.regionalLanguage ?: older.regionalLanguage,
            customDestinationLanguage = newer.customDestinationLanguage ?: older.customDestinationLanguage,
        )

    /** Vrai quand la requête ne porte aucun champ : rien à envoyer. */
    fun isEmpty(request: UpdateProfileRequest): Boolean = request == UpdateProfileRequest()

    private fun requiredText(current: String, original: String?): String? {
        val trimmed = current.trim()
        if (trimmed.isEmpty()) return null
        return trimmed.takeIf { it != original?.trim() }
    }

    private fun requiredLanguage(current: String, original: String?): String? {
        val code = normalizeLanguage(current)?.takeIf { it.isNotEmpty() } ?: return null
        return code.takeIf { it != normalizeLanguage(original) }
    }

    private fun clearableLanguage(current: String, original: String?): String? {
        val code = normalizeLanguage(current) ?: return null
        return changedOrNil(code, normalizeLanguage(original))
    }
}
