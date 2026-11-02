package me.meeshy.sdk.model

/** Ce que la page d'invitation propose de faire — miroir de `InviteLandingChoice` (iOS). */
enum class InviteLandingChoice { JOIN_WITH_ACCOUNT, JOIN_ANONYMOUSLY, SIGN_IN, SIGN_UP }

/** Les champs que le formulaire invité demandera, dans l'ordre d'affichage. */
enum class InviteRequestedField { NAME, NICKNAME, EMAIL, BIRTHDAY }

/** Les règles pures de la page d'invitation : qui peut entrer, et sous quel libellé. */
object InviteLandingRules {

    /**
     * Matrice des choix, l'action principale en premier. Lien fermé (plein ou expiré) :
     * aucun choix — la page le dit plutôt que d'offrir un bouton qui échouera.
     */
    fun choices(isSignedIn: Boolean, requireAccount: Boolean, isOpen: Boolean = true): List<InviteLandingChoice> {
        if (!isOpen) return emptyList()
        if (isSignedIn) {
            return if (requireAccount) listOf(InviteLandingChoice.JOIN_WITH_ACCOUNT)
            else listOf(InviteLandingChoice.JOIN_WITH_ACCOUNT, InviteLandingChoice.JOIN_ANONYMOUSLY)
        }
        return if (requireAccount) listOf(InviteLandingChoice.SIGN_IN, InviteLandingChoice.SIGN_UP)
        else listOf(InviteLandingChoice.JOIN_ANONYMOUSLY, InviteLandingChoice.SIGN_IN, InviteLandingChoice.SIGN_UP)
    }

    /** Le nom TOUJOURS, puis ce que le lien ajoute. */
    fun requestedFields(requireNickname: Boolean, requireEmail: Boolean, requireBirthday: Boolean): List<InviteRequestedField> =
        buildList {
            add(InviteRequestedField.NAME)
            if (requireNickname) add(InviteRequestedField.NICKNAME)
            if (requireEmail) add(InviteRequestedField.EMAIL)
            if (requireBirthday) add(InviteRequestedField.BIRTHDAY)
        }

    /**
     * Clé de libellé iOS (`Localizable` de MeeshyUI) du bouton d'un choix :
     * reprendre / rejoindre / continuer en anonyme selon la session invitée et le compte.
     */
    fun titleKey(choice: InviteLandingChoice, isSignedIn: Boolean, resumesGuestSession: Boolean): String =
        when (choice) {
            InviteLandingChoice.JOIN_WITH_ACCOUNT -> "inviteLanding.choice.joinWithAccount"
            InviteLandingChoice.JOIN_ANONYMOUSLY -> when {
                resumesGuestSession -> "inviteLanding.choice.resumeAnonymously"
                isSignedIn -> "inviteLanding.choice.joinAnonymously"
                else -> "inviteLanding.choice.continueAnonymously"
            }
            InviteLandingChoice.SIGN_IN -> "inviteLanding.choice.signIn"
            InviteLandingChoice.SIGN_UP -> "inviteLanding.choice.signUp"
        }
}

fun ShareLinkInfo.landingChoices(isSignedIn: Boolean, now: Long): List<InviteLandingChoice> =
    InviteLandingRules.choices(isSignedIn, requireAccount, isOpen(now))

val ShareLinkInfo.requestedFields: List<InviteRequestedField>
    get() = InviteLandingRules.requestedFields(requireNickname, requireEmail, requireBirthday)
