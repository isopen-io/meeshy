package me.meeshy.sdk.model.push

/**
 * Un accusé de réception raté mérite-t-il un rejeu ? Seuls réseau (statut inconnu), 5xx, 401, 408 et 429 sont
 * transitoires. Un 4xx permanent (dont 403) ne guérira pas : le rejouer ne ferait qu'encombrer la file.
 */
public object PushReceiptRetryPolicy {
    private val RETRYABLE_CLIENT_STATUSES = setOf(401, 408, 429)

    public fun shouldRetry(httpStatus: Int?): Boolean = when {
        httpStatus == null -> true
        httpStatus in 500..599 -> true
        httpStatus in RETRYABLE_CLIENT_STATUSES -> true
        else -> false
    }
}
