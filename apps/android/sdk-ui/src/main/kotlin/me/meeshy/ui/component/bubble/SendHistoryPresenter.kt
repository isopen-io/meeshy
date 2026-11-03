package me.meeshy.ui.component.bubble

import me.meeshy.sdk.model.SendAttempt
import me.meeshy.sdk.model.SendAttemptOrdinal
import me.meeshy.sdk.model.SendTransport

/** Une ligne de la carte « Historique d'envoi ». */
public data class SendHistoryRow(
    val attemptNumber: Int,
    val ordinal: SendAttemptOrdinal,
    /** `null` : transport inconnu, la ligne montre alors [rawTransport]. */
    val transport: SendTransport?,
    val rawTransport: String,
    val startedAtMillis: Long,
    val isSuccess: Boolean,
    /** Montrée en rouge discret ; jamais pour un succès. */
    val error: String?,
)

/** La carte entière : ses lignes chronologiques et le compte. */
public data class SendHistory(val rows: List<SendHistoryRow>) {
    val count: Int get() = rows.size
    val firstAttemptAtMillis: Long get() = rows.first().startedAtMillis
}

/**
 * Projette le journal d'envoi d'un message en carte de détails (miroir de `MessageViewsSendAttemptsCard`, iOS).
 * Pas de carte pour un message reçu, ni quand aucune tentative locale n'existe. Pure et sans état.
 */
public object SendHistoryPresenter {

    public fun present(attempts: List<SendAttempt>, isMine: Boolean): SendHistory? {
        if (!isMine || attempts.isEmpty()) return null
        val rows = attempts
            .sortedWith(compareBy({ it.attemptNumber }, { it.startedAtMillis }))
            .map { attempt ->
                SendHistoryRow(
                    attemptNumber = attempt.attemptNumber,
                    ordinal = SendAttemptOrdinal.of(attempt.attemptNumber),
                    transport = SendTransport.fromWire(attempt.transport),
                    rawTransport = attempt.transport,
                    startedAtMillis = attempt.startedAtMillis,
                    isSuccess = attempt.isSuccess,
                    error = attempt.errorMessage?.takeIf { !attempt.isSuccess && it.isNotBlank() },
                )
            }
        return SendHistory(rows)
    }
}
