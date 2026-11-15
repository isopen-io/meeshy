package me.meeshy.sdk.model.auth

/**
 * Ce qui est PARU de l'inscription — monotone : un champ paru ne disparaît jamais.
 * Miroir de `SignupPhases.swift` / `apps/web/src/lib/view/signup-phases.ts`.
 */
public data class SignupProgress(val emailShown: Boolean = false, val cardShown: Boolean = false) {

    /** L'adresse paraît dès qu'un numéro plausible existe, la carte dès que l'adresse est cohérente. */
    public fun advanced(phoneGiven: Boolean, emailValid: Boolean): SignupProgress {
        val email = emailShown || phoneGiven
        return SignupProgress(emailShown = email, cardShown = cardShown || (email && emailValid))
    }

    public companion object {
        public val INITIAL: SignupProgress = SignupProgress()
    }
}

/** Ce que la carte sait du compte. */
public sealed interface SignupCardStage {
    public data object Editing : SignupCardStage

    /** Le compte existe et attend son code ; [signedIn] faux pour une revendication d'adresse. */
    public data class AwaitingCode(val signedIn: Boolean) : SignupCardStage

    public data object Verified : SignupCardStage
}

public enum class SignupPhase { PHONE, EMAIL, CARD, CODE, VERIFIED }

/** « S'inscrire » puis « Parler aux autres ». */
public sealed interface SignupPrimaryAction {
    public data class SignUp(val enabled: Boolean) : SignupPrimaryAction
    public data object Talk : SignupPrimaryAction
}

public object SignupPhases {

    public fun phase(progress: SignupProgress, card: SignupCardStage): SignupPhase = when (card) {
        SignupCardStage.Verified -> SignupPhase.VERIFIED
        is SignupCardStage.AwaitingCode -> SignupPhase.CODE
        SignupCardStage.Editing -> when {
            progress.cardShown -> SignupPhase.CARD
            progress.emailShown -> SignupPhase.EMAIL
            else -> SignupPhase.PHONE
        }
    }

    public fun primaryAction(progress: SignupProgress, card: SignupCardStage, formReady: Boolean): SignupPrimaryAction =
        when (card) {
            SignupCardStage.Verified -> SignupPrimaryAction.Talk
            is SignupCardStage.AwaitingCode -> SignupPrimaryAction.SignUp(enabled = card.signedIn)
            SignupCardStage.Editing -> SignupPrimaryAction.SignUp(enabled = progress.cardShown && formReady)
        }

    /** Le refus du numéro se dit-il sous le champ ? (#9343) — fonction pure. */
    public fun phoneRefusalShown(refused: Boolean, checked: Boolean, progress: SignupProgress): Boolean =
        refused && (checked || progress.emailShown)

    /** Le mot de passe paraît une fois l'identité définie et ne se referme jamais. */
    public fun passwordRevealed(alreadyRevealed: Boolean, identityDefined: Boolean): Boolean =
        alreadyRevealed || identityDefined
}
