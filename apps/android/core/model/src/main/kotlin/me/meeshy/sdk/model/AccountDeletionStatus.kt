package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * L'etat de la demande de suppression de compte — `GET /me/account/deletion`. Port de
 * `AccountDeletionStatus` (`AccountService.swift`). `status == null` signifie « aucune
 * demande en cours » : c'est une REPONSE (200), jamais une absence de ressource. Les dates
 * restent les chaines ISO-8601 du fil (lues par [WireDate]).
 */
@Serializable
data class AccountDeletionStatus(
    val status: String? = null,
    val confirmedAt: String? = null,
    val gracePeriodEndsAt: String? = null,
    val canCancelUntil: String? = null,
) {
    val hasOpenRequest: Boolean get() = status != null
}
