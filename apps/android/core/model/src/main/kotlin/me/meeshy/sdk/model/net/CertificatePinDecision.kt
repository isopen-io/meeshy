package me.meeshy.sdk.model.net

/**
 * Verdict d'une vérification d'épinglage SPKI — miroir de `CertificatePinDecision` iOS
 * (`packages/MeeshySDK/.../Networking/CertificatePinning.swift`).
 */
sealed interface CertificatePinDecision {
    /** Aucune empreinte configurée : validation système seule. */
    data object Unconfigured : CertificatePinDecision

    /** Un certificat de la chaîne porte une empreinte attendue. */
    data class Matched(val hash: String) : CertificatePinDecision

    /** Des empreintes sont configurées et aucune ne correspond : la connexion est refusée. */
    data object Mismatch : CertificatePinDecision

    /** Aucune empreinte lisible dans la chaîne (algorithme non géré, certificat corrompu) : refus. */
    data object ChainUnreadable : CertificatePinDecision

    val isAllowed: Boolean get() = this is Unconfigured || this is Matched
}

/** Évaluateur sans état : la chaîne est donnée feuille d'abord, `null` = empreinte illisible. */
object CertificatePinEvaluator {
    fun evaluate(chainHashes: List<String?>, pinSet: Set<String>): CertificatePinDecision {
        if (pinSet.isEmpty()) return CertificatePinDecision.Unconfigured
        if (chainHashes.isEmpty()) return CertificatePinDecision.ChainUnreadable
        val readable = chainHashes.filterNotNull()
        if (readable.isEmpty()) return CertificatePinDecision.ChainUnreadable
        val hit = readable.firstOrNull { it in pinSet }
        return if (hit != null) CertificatePinDecision.Matched(hit) else CertificatePinDecision.Mismatch
    }
}
