package me.meeshy.sdk.model.call

/**
 * **CE QUE `getStats` DIT DES GELS, DE LA LIMITATION ET DU RELAIS** (#19895) —
 * le miroir Android de `readMediaQuality` (web, #19876) et de
 * `CallMediaQuality.reduce` (iOS, #11294) : gels, NACK et PLI de la vidéo
 * reçue ; tampon de gigue et échantillons masqués de l'audio reçu ; cause de
 * limitation de l'émission vidéo ; type du candidat LOCAL de la paire élue et
 * son transport vers le relais.
 *
 * Les compteurs sont CUMULÉS par WebRTC depuis l'ouverture du lien : le dernier
 * relevé les porte tous. Une mesure absente, non finie ou négative reste `null`,
 * jamais 0. Du candidat local, seuls son TYPE et son transport vers le relais
 * sont lus — jamais adresse, port, ufrag ni URL.
 */
data class CallMediaQuality(
    val freezeCount: Double? = null,
    /** Secondes. */
    val totalFreezesDuration: Double? = null,
    /** Secondes cumulées des seuls flux audio qui portent aussi un compte émis positif. */
    val jitterBufferDelay: Double? = null,
    val jitterBufferEmittedCount: Double? = null,
    val concealedSamples: Double? = null,
    val nackCount: Double? = null,
    val pliCount: Double? = null,
    val qualityLimitationReason: String? = null,
    val candidateType: String? = null,
    val relayProtocol: String? = null,
) {
    companion object {
        /** Lecture pure d'un rapport projeté ; ne lève jamais. */
        fun read(entries: List<CallStats.RawEntry>): CallMediaQuality {
            val inbound = entries.filter { it.type == "inbound-rtp" }
            val video = inbound.filter { it.kind == "video" }
            val audio = inbound.filter { it.kind != "video" }
            val buffered = audio.filter { entry ->
                measured(entry.values["jitterBufferDelay"]) != null &&
                    (measured(entry.values["jitterBufferEmittedCount"]) ?: 0.0) > 0.0
            }
            val local = CallStats.selectedCandidatePair(entries)?.strings?.get("localCandidateId")
                ?.let { id -> entries.firstOrNull { it.type == "local-candidate" && it.id == id } }
            val candidateType = text(local?.strings?.get("candidateType"))
            return CallMediaQuality(
                freezeCount = sumOf(video, "freezeCount"),
                totalFreezesDuration = sumOf(video, "totalFreezesDuration"),
                jitterBufferDelay = sumOf(buffered, "jitterBufferDelay"),
                jitterBufferEmittedCount = sumOf(buffered, "jitterBufferEmittedCount"),
                concealedSamples = sumOf(audio, "concealedSamples"),
                nackCount = sumOf(video, "nackCount"),
                pliCount = sumOf(video, "pliCount"),
                qualityLimitationReason = entries.firstNotNullOfOrNull { entry ->
                    text(entry.strings["qualityLimitationReason"])
                        ?.takeIf { entry.type == "outbound-rtp" && entry.kind == "video" }
                },
                candidateType = candidateType,
                relayProtocol = if (candidateType == "relay") text(local?.strings?.get("relayProtocol")) else null,
            )
        }

        private fun measured(value: Double?): Double? = value?.takeIf { it.isFinite() && it >= 0.0 }

        private fun text(value: String?): String? = value?.takeIf { it.isNotEmpty() }

        /** La somme des flux qui PORTENT la mesure ; `null` quand aucun ne la porte. */
        private fun sumOf(entries: List<CallStats.RawEntry>, field: String): Double? =
            entries.mapNotNull { measured(it.values[field]) }.takeIf { it.isNotEmpty() }?.sum()
    }
}
