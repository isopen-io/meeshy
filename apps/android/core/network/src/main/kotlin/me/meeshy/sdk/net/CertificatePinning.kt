package me.meeshy.sdk.net

import me.meeshy.sdk.model.net.CertificatePinPolicy
import java.security.MessageDigest
import java.security.interfaces.ECPublicKey
import java.security.interfaces.RSAPublicKey
import java.security.cert.X509Certificate
import java.time.Instant
import java.util.Base64

/**
 * Épinglage SHA-256 du SubjectPublicKeyInfo (RFC 7469), miroir de `CertificatePinning` iOS.
 * Le SPKI plutôt que le certificat : l'opérateur réémet son certificat librement tant que la
 * clé publique ne change pas.
 *
 * `PublicKey.getEncoded()` rend déjà le SPKI DER (X.509) : aucune table d'en-têtes ASN.1.
 * Seuls RSA 2048/4096 et EC P-256/P-384 sont reconnus, comme sur iOS ; tout autre algorithme
 * est illisible et donc refusé (échec fermé).
 */
object CertificatePinning {

    fun spkiSha256Base64(certificate: X509Certificate): String? {
        val key = certificate.publicKey
        if (!isSupported(key)) return null
        val digest = MessageDigest.getInstance("SHA-256").digest(key.encoded)
        return Base64.getEncoder().encodeToString(digest)
    }

    private fun isSupported(key: java.security.PublicKey): Boolean = when (key) {
        is RSAPublicKey -> key.modulus.bitLength() in RSA_SIZES
        is ECPublicKey -> key.params.order.bitLength() in EC_SIZES
        else -> false
    }

    private val RSA_SIZES = setOf(2048, 4096)
    private val EC_SIZES = setOf(256, 384)
}

/**
 * Le pin-set de la passerelle. Les empreintes se renseignent par la procédure de rotation
 * de `decisions.md` (ADR-026) : tant qu'elles sont vides, la production et le staging restent
 * en mode « non configuré » (validation système seule, journalisée) — jamais une brique.
 */
object GatewayPins {
    /** SPKI de la clé en service. */
    val CURRENT: Set<String> = emptySet()

    /** SPKI de la clé de secours, générée et conservée hors ligne AVANT la rotation. */
    val BACKUP: Set<String> = emptySet()

    /** Passé cette date le pin-set est ignoré (journalisé) : la rotation DOIT avoir eu lieu. */
    val EXPIRES_AT_EPOCH_MILLIS: Long = Instant.parse("2027-10-01T00:00:00Z").toEpochMilli()

    val POLICY: CertificatePinPolicy = CertificatePinPolicy(
        pinnedHosts = CertificatePinPolicy.PINNED_HOSTS,
        currentPins = CURRENT,
        backupPins = BACKUP,
        expiresAtEpochMillis = EXPIRES_AT_EPOCH_MILLIS,
    )
}
