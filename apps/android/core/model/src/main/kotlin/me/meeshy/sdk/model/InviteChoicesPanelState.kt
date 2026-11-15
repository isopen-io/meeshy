package me.meeshy.sdk.model

/** L'avis qui remplace ou précède les boutons. */
enum class InviteChoiceNotice { ACCOUNT_REQUIRED, CLOSED }

/** Les légendes sous le bouton principal ou sous les secondaires. */
enum class InviteChoiceCaption { ANONYMOUS_SIGNED_OUT, ANONYMOUS_SIGNED_IN }

/** Le visage du compte connecté : sa photo si elle est servie, sinon ses initiales. */
data class InviteAccountFace(val name: String, val avatarUrl: String?) {
    val initials: String
        get() {
            val letters = name.trim().split(Regex("\\s+"))
                .mapNotNull { word -> word.firstOrNull { it.isLetter() } }
                .take(2)
                .joinToString("")
            return letters.ifEmpty { name.trim().take(1).ifEmpty { "?" } }.uppercase()
        }
}

/**
 * Le panneau de choix ancré en bas, décidé ici et rien que ici : l'ordre et la présence de chaque
 * choix viennent de [InviteLandingRules], la vue ne décide rien. Miroir de `InviteChoicesPanel` (iOS).
 */
data class InviteChoicesPanelState(
    val primary: InviteLandingChoice?,
    val secondary: List<InviteLandingChoice>,
    val notice: InviteChoiceNotice?,
    val captionAfterPrimary: InviteChoiceCaption?,
    val captionAfterSecondary: InviteChoiceCaption?,
    val resumesGuestSession: Boolean,
    val isSignedIn: Boolean,
    val accountFace: InviteAccountFace?,
) {
    /** Le visage n'est montré que sur « Rejoindre avec mon compte ». */
    val showsAccountFace: Boolean get() = primary == InviteLandingChoice.JOIN_WITH_ACCOUNT && accountFace != null

    fun titleKey(choice: InviteLandingChoice): String =
        InviteLandingRules.titleKey(choice, isSignedIn, resumesGuestSession)

    companion object {
        fun from(
            info: ShareLinkInfo,
            now: Long,
            isSignedIn: Boolean,
            resumesGuestSession: Boolean = false,
            accountFace: InviteAccountFace? = null,
        ): InviteChoicesPanelState {
            val choices = info.landingChoices(isSignedIn, now)
            val primary = choices.firstOrNull()
            val secondary = choices.drop(1)
            return InviteChoicesPanelState(
                primary = primary,
                secondary = secondary,
                notice = when {
                    primary == null -> InviteChoiceNotice.CLOSED
                    info.requireAccount && !isSignedIn -> InviteChoiceNotice.ACCOUNT_REQUIRED
                    else -> null
                },
                captionAfterPrimary =
                    if (primary == InviteLandingChoice.JOIN_ANONYMOUSLY && !isSignedIn) InviteChoiceCaption.ANONYMOUS_SIGNED_OUT else null,
                captionAfterSecondary =
                    if (isSignedIn && InviteLandingChoice.JOIN_ANONYMOUSLY in secondary) InviteChoiceCaption.ANONYMOUS_SIGNED_IN else null,
                resumesGuestSession = resumesGuestSession,
                isSignedIn = isSignedIn,
                accountFace = accountFace,
            )
        }
    }
}
