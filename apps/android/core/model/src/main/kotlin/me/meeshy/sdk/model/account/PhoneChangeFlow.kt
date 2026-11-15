package me.meeshy.sdk.model.account

import me.meeshy.sdk.model.auth.PhonePlausibility

enum class PhoneChangeStage { IDLE, EDIT, CODE_ENVOYE, VERIFIE }

/**
 * Flux de changement de téléphone, pur et réutilisable (écran Sécurité, proposition
 * d'ajout de numéro avant la recherche de contacts #8843) : saisie du numéro, envoi du
 * code SMS, saisie du code à 6 chiffres, vérification. Les appels réseau et les erreurs
 * restent chez l'appelant ; ce modèle ne porte que les transitions et les gardes.
 */
data class PhoneChangeFlow(
    val stage: PhoneChangeStage = PhoneChangeStage.IDLE,
    val number: String = "",
    val code: String = "",
) {
    val isEditing: Boolean get() = stage == PhoneChangeStage.EDIT
    val isCodeSent: Boolean get() = stage == PhoneChangeStage.CODE_ENVOYE

    val canSendCode: Boolean get() = PhonePlausibility.isSubmittable(number)

    /** Le motif pour lequel le numéro SAISI est refusé, `null` s'il est plausible ou vide. */
    val numberRefusal: PhonePlausibility.Refusal? get() = PhonePlausibility.refusal(number)
    val canVerify: Boolean get() = isCodeSent && code.length == CODE_LENGTH

    fun beginEdit(current: String?): PhoneChangeFlow =
        PhoneChangeFlow(PhoneChangeStage.EDIT, number = current.orEmpty())

    fun onNumberChange(value: String): PhoneChangeFlow = copy(number = value)

    fun onCodeChange(value: String): PhoneChangeFlow =
        copy(code = value.filter(Char::isDigit).take(CODE_LENGTH))

    fun codeSent(): PhoneChangeFlow = copy(stage = PhoneChangeStage.CODE_ENVOYE, code = "")

    fun verified(): PhoneChangeFlow = PhoneChangeFlow(PhoneChangeStage.VERIFIE)

    fun back(): PhoneChangeFlow = when (stage) {
        PhoneChangeStage.CODE_ENVOYE -> copy(stage = PhoneChangeStage.EDIT, code = "")
        else -> PhoneChangeFlow()
    }

    fun cancel(): PhoneChangeFlow = PhoneChangeFlow()

    companion object {
        const val CODE_LENGTH = 6
    }
}
