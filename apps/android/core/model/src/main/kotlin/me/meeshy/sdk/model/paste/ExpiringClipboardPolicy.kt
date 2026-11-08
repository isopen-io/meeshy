package me.meeshy.sdk.model.paste

import java.security.MessageDigest

/**
 * La règle de l'effacement d'un secret copié (clé 2FA, codes de récupération) — miroir de `ExpiringClipboard` (iOS : 30 s).
 * On n'efface que si le presse-papiers porte encore l'EMPREINTE de ce que nous y avons écrit : le secret lui-même
 * n'est jamais gardé en mémoire pendant l'attente.
 */
public object ExpiringClipboardPolicy {
    public const val LIFETIME_MS: Long = 30_000L

    public fun fingerprint(secret: String): String =
        MessageDigest.getInstance("SHA-256").digest(secret.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }

    public fun shouldClear(writtenFingerprint: String, currentText: String?): Boolean =
        currentText != null && fingerprint(currentText) == writtenFingerprint
}
