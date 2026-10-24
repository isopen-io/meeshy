package me.meeshy.sdk.contacts

import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri

/** Pourquoi une invitation SMS ne peut pas partir (l'UI traduit en toast). */
sealed interface SmsInviteFailure {
    /** « Ce contact n'a pas de numéro ». */
    data object MissingNumber : SmsInviteFailure

    /** « SMS non disponible » : aucune application SMS sur l'appareil. */
    data object Unavailable : SmsInviteFailure
}

/** Le résultat de la construction d'une invitation : un intent prêt, ou une erreur typée. */
sealed interface SmsInviteResult {
    data class Ready(val intent: Intent) : SmsInviteResult
    data class Failed(val failure: SmsInviteFailure) : SmsInviteResult
}

/**
 * Construit l'`ACTION_SENDTO smsto:{numéro}` portant `sms_body`. L'appelant vérifie
 * [canResolve] avant `startActivity` pour afficher « SMS non disponible » au lieu de planter.
 */
object SmsInviteIntent {
    const val EXTRA_BODY: String = "sms_body"

    fun build(phoneNumber: String?, body: String): SmsInviteResult {
        val number = phoneNumber?.filterNot { it.isWhitespace() }.orEmpty()
        if (number.isEmpty()) return SmsInviteResult.Failed(SmsInviteFailure.MissingNumber)
        val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:$number")).apply {
            putExtra(EXTRA_BODY, body)
        }
        return SmsInviteResult.Ready(intent)
    }

    fun canResolve(packageManager: PackageManager, intent: Intent): Boolean =
        intent.resolveActivity(packageManager) != null
}
