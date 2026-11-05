package me.meeshy.sdk.model

import me.meeshy.sdk.model.media.MediaUploadProgress

/**
 * Le pourcentage que la bulle d'un message en cours d'envoi montre à la place de l'horloge (#16133, iOS #14702).
 * Le registre des octets en vol est tenu par `cmid` de téléversement, et l'identifiant d'une pièce d'une bulle
 * optimiste EST ce `cmid` tant que la passerelle ne lui a pas donné le sien : la correspondance se lit donc
 * directement, sans table intermédiaire. Pur.
 */
object BubbleSendProgress {

    /**
     * Le pourcentage entier (arrondi vers le bas, jamais au-delà de 100) des pièces de [attachmentIds] encore en vol,
     * sommées octet pour octet ; `null` quand aucune ne l'est — l'horloge d'envoi reste alors, un anneau figé à zéro
     * serait pire que pas d'anneau.
     */
    fun percent(attachmentIds: Collection<String>, progress: Map<String, MediaUploadProgress>): Int? {
        val inFlight = attachmentIds.mapNotNull { progress[it] as? MediaUploadProgress.Uploading }.filter { it.total > 0 }
        if (inFlight.isEmpty()) return null
        val total = inFlight.sumOf { it.total }
        val sent = inFlight.sumOf { it.sent.coerceIn(0L, it.total) }
        return (sent * 100 / total).toInt()
    }
}
