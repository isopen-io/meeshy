package me.meeshy.sdk.model.account

/**
 * Verdict du badge capsule des lignes e-mail / téléphone de l'écran Sécurité :
 * Vérifié (vert) / Non vérifié (orange), dérivé de `emailVerifiedAt` / `phoneVerifiedAt`
 * (un horodatage nullable suffit, jamais un booléen jumeau). Pas de badge sans valeur.
 */
enum class ContactVerificationBadge {
    VERIFIED,
    NOT_VERIFIED;

    companion object {
        fun of(value: String?, verifiedAt: String?): ContactVerificationBadge? = when {
            value.isNullOrBlank() -> null
            verifiedAt != null -> VERIFIED
            else -> NOT_VERIFIED
        }
    }
}
