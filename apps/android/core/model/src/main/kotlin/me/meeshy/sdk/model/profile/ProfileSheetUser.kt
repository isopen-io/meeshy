package me.meeshy.sdk.model.profile

/**
 * La personne qu'une fiche profil présente — miroir de `ProfileSheetUser`
 * (packages/MeeshySDK/Sources/MeeshyUI/Profile/ProfileSheetUser.swift).
 *
 * Deux identités voyagent séparément : [userId] est un compte, [participantId] une ligne de
 * participation. Un visiteur sans compte ([isAnonymous]) garde [userId] nul : un id de
 * participation n'est JAMAIS recopié dans [userId].
 *
 * [accentColor] vaut la couleur reçue de la surface d'origine, ou vide : la couleur du profil
 * se calcule avec `DynamicColorGenerator.profileAccentHex` (:sdk-core), pas ici.
 */
data class ProfileSheetUser(
    val userId: String? = null,
    val username: String,
    val displayName: String? = null,
    val avatarUrl: String? = null,
    val accentColor: String = "",
    val bio: String? = null,
    val systemLanguage: String? = null,
    val regionalLanguage: String? = null,
    val isOnline: Boolean? = null,
    val lastActiveAtEpochMillis: Long? = null,
    val createdAtEpochMillis: Long? = null,
    val bannerUrl: String? = null,
    val timezone: String? = null,
    val registrationCountry: String? = null,
    val profileCompletionRate: Int? = null,
    val hasE2EE: Boolean = false,
    val voicePublic: Boolean? = null,
    val voiceSampleUrl: String? = null,
    val voiceSampleDurationMs: Int? = null,
    val voiceQuality: Double? = null,
    val participantId: String? = null,
    val isAnonymous: Boolean = false,
) {
    /** Compte, sinon participation, sinon pseudo. */
    val id: String get() = userId ?: participantId ?: username

    val resolvedDisplayName: String get() = displayName ?: username

    companion object {
        private const val OBJECT_ID_LENGTH = 24

        /** Un ObjectId (24 hexadécimaux, majuscules comprises) est un compte ; le reste est un pseudo. */
        fun from(idOrUsername: String): ProfileSheetUser =
            if (isObjectId(idOrUsername)) {
                ProfileSheetUser(userId = idOrUsername, username = idOrUsername)
            } else {
                ProfileSheetUser(username = idOrUsername)
            }

        internal fun isObjectId(value: String): Boolean =
            value.length == OBJECT_ID_LENGTH && value.all { it in '0'..'9' || it in 'a'..'f' || it in 'A'..'F' }
    }
}
