package me.meeshy.sdk.model

/** Les quatre droits d'un invité sans compte, dans l'ordre où la page les montre. */
enum class InviteGuestRight { MESSAGES, IMAGES, HISTORY, FILES }

/** Un droit et son état : accordé ou non. */
data class InviteRightRow(val right: InviteGuestRight, val allowed: Boolean)

/** Combien de temps le lien reste valable. */
sealed interface InviteValidity {
    data object NoExpiry : InviteValidity
    data object Expired : InviteValidity
    data class DaysLeft(val days: Int) : InviteValidity
}

/**
 * La carte « En anonyme, tu pourras » : droits, champs demandés, langues acceptées, validité et
 * places. Miroir de `ShareLinkInvitationTerms` (iOS). [acceptedLanguages] vide = toutes.
 */
data class ShareLinkInvitationTerms(
    val rights: List<InviteRightRow>,
    val requestedFields: List<InviteRequestedField>,
    val acceptedLanguages: List<String>,
    val validity: InviteValidity,
    val remainingPlaces: Int?,
    val maxUses: Int?,
) {
    companion object {
        fun from(info: ShareLinkInfo, now: Long): ShareLinkInvitationTerms {
            val rights = info.guestRights
            return ShareLinkInvitationTerms(
                rights = listOf(
                    InviteRightRow(InviteGuestRight.MESSAGES, rights.messages),
                    InviteRightRow(InviteGuestRight.IMAGES, rights.images),
                    InviteRightRow(InviteGuestRight.HISTORY, rights.history),
                    InviteRightRow(InviteGuestRight.FILES, rights.files),
                ),
                requestedFields = info.requestedFields,
                acceptedLanguages = info.allowedLanguages,
                validity = when (val days = info.daysLeft(now)) {
                    null -> InviteValidity.NoExpiry
                    0 -> InviteValidity.Expired
                    else -> InviteValidity.DaysLeft(days)
                },
                remainingPlaces = info.remainingPlaces,
                maxUses = info.maxUses,
            )
        }
    }
}
