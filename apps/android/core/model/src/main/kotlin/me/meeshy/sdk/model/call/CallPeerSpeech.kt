package me.meeshy.sdk.model.call

import me.meeshy.sdk.model.call.group.ActiveSpeakerDetector

/**
 * G4.2 — l'anneau et le halo de la personne dont la caméra est coupée n'existent qu'à la PAROLE, jamais au repos
 * (miroir de iOS `CallPeerSpeech`). Le niveau audio reçu du duo passe par la même hystérésis que les vignettes d'un
 * groupe ([ActiveSpeakerDetector]), sans quoi l'anneau clignoterait entre deux syllabes. Valeur immuable.
 */
data class CallPeerSpeech(private val detector: ActiveSpeakerDetector = ActiveSpeakerDetector()) {
    val isSpeaking: Boolean get() = detector.isSpeaking(PEER)

    /** Un relevé : un niveau absent (aucune mesure) laisse le maintien s'écouler. */
    fun recording(level: Double?, nowMillis: Long): CallPeerSpeech =
        copy(detector = detector.recording(level?.let { mapOf(PEER to it) } ?: emptyMap(), nowMillis))

    companion object {
        private const val PEER = "peer"

        /**
         * Un groupe encore montré en duo : le maillage relève déjà le niveau du pair principal toutes les 400 ms
         * (`speakingUserIds`) et son verdict se relaie. `null` hors maillage : le placeholder relève lui-même —
         * jamais deux `getStats` pour une même connexion.
         */
        fun relayed(meshActive: Boolean, speakers: Set<String>, peerUserId: String?): Boolean? =
            if (!meshActive) null else peerUserId?.let { it in speakers } ?: false
    }
}
