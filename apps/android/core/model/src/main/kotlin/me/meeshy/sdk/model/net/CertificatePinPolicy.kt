package me.meeshy.sdk.model.net

/** Ce que la politique d'épinglage exige pour un hôte à un instant donné. */
sealed interface CertificatePinMode {
    /** Hôte hors pin-set (localhost, 10.0.2.2, environnement personnalisé) ou pin-set vide. */
    data object Unconfigured : CertificatePinMode

    /** L'hôte est épinglé : un certificat de la chaîne doit porter l'une de ces empreintes. */
    data class Enforced(val pins: Set<String>) : CertificatePinMode

    /**
     * Le pin-set a dépassé sa date d'expiration. Comportement documenté (decisions.md) :
     * validation système seule, signalée au journal — jamais une brique silencieuse.
     */
    data object Expired : CertificatePinMode
}

/**
 * Le pin-set de la passerelle : empreintes SHA-256 base64 du SPKI (courante + secours),
 * hôtes épinglés et date d'expiration.
 */
data class CertificatePinPolicy(
    val pinnedHosts: Set<String>,
    val currentPins: Set<String>,
    val backupPins: Set<String>,
    val expiresAtEpochMillis: Long,
) {
    fun modeFor(host: String, nowEpochMillis: Long): CertificatePinMode {
        val pins = currentPins + backupPins
        return when {
            host.lowercase() !in pinnedHosts -> CertificatePinMode.Unconfigured
            pins.isEmpty() -> CertificatePinMode.Unconfigured
            nowEpochMillis >= expiresAtEpochMillis -> CertificatePinMode.Expired
            else -> CertificatePinMode.Enforced(pins)
        }
    }

    companion object {
        val PINNED_HOSTS: Set<String> = setOf("gate.meeshy.me", "gate.staging.meeshy.me")
    }
}
