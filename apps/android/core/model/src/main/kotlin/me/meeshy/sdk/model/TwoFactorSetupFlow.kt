package me.meeshy.sdk.model

/**
 * Étapes de l'activation 2FA — miroir de `TwoFactorSetupView.SetupStep` (iOS) :
 * chargement, QR + clé, saisie du code, succès avec codes de secours, erreur plein écran.
 */
public enum class TwoFactorSetupStep { LOADING, QR, CODE, SUCCESS, ERROR }

/**
 * Machine à états pure de l'activation 2FA. Chaque transition rend un nouvel état ;
 * une transition illégale depuis l'étape courante est ignorée (le double envoi d'un
 * tap ne peut ni sauter une étape ni en rejouer une).
 */
public data class TwoFactorSetupFlow(
    val step: TwoFactorSetupStep = TwoFactorSetupStep.LOADING,
    val codeRejected: Boolean = false,
) {
    /** La configuration (re)démarre : écran de chargement, quelle que soit l'étape. */
    public fun started(): TwoFactorSetupFlow = TwoFactorSetupFlow(TwoFactorSetupStep.LOADING)

    public fun setupLoaded(): TwoFactorSetupFlow =
        if (step == TwoFactorSetupStep.LOADING) TwoFactorSetupFlow(TwoFactorSetupStep.QR) else this

    public fun setupFailed(): TwoFactorSetupFlow =
        if (step == TwoFactorSetupStep.LOADING) TwoFactorSetupFlow(TwoFactorSetupStep.ERROR) else this

    /** « Suivant » : du QR vers la saisie du code. */
    public fun next(): TwoFactorSetupFlow =
        if (step == TwoFactorSetupStep.QR) TwoFactorSetupFlow(TwoFactorSetupStep.CODE) else this

    /** « Retour au QR code » : de la saisie vers le QR, sans erreur résiduelle. */
    public fun backToQr(): TwoFactorSetupFlow =
        if (step == TwoFactorSetupStep.CODE) TwoFactorSetupFlow(TwoFactorSetupStep.QR) else this

    public fun verified(): TwoFactorSetupFlow =
        if (step == TwoFactorSetupStep.CODE) TwoFactorSetupFlow(TwoFactorSetupStep.SUCCESS) else this

    /** Code refusé : on reste sur la saisie, l'erreur s'affiche sous le champ. */
    public fun codeInvalid(): TwoFactorSetupFlow =
        if (step == TwoFactorSetupStep.CODE) copy(codeRejected = true) else this

    /** Le code est ressaisi : l'erreur s'efface. */
    public fun codeEdited(): TwoFactorSetupFlow =
        if (step == TwoFactorSetupStep.CODE && codeRejected) copy(codeRejected = false) else this
}
