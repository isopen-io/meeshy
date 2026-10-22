package me.meeshy.sdk.auth

import me.meeshy.sdk.model.auth.PhoneProofRefusal
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult

/**
 * Ce qu'une étape d'une preuve par SMS (récupération par téléphone, transfert de
 * numéro) a produit : sa valeur, ou un refus TYPÉ ([PhoneProofRefusal]) que l'écran
 * de l'étape pose sous le bon champ. L'[ApiError] d'origine accompagne le refus —
 * son `message` reste la chaîne machine de la passerelle, utile au journal.
 */
sealed interface PhoneProofResult<out T> {
    data class Done<T>(val value: T) : PhoneProofResult<T>

    data class Refused(val refusal: PhoneProofRefusal, val error: ApiError) : PhoneProofResult<Nothing>
}

internal fun <T> NetworkResult<T>.toPhoneProofResult(): PhoneProofResult<T> = when (this) {
    is NetworkResult.Success -> PhoneProofResult.Done(data)
    is NetworkResult.Failure -> PhoneProofResult.Refused(
        refusal = PhoneProofRefusal.from(httpStatus = error.httpStatus, code = error.code, message = error.message),
        error = error,
    )
}
