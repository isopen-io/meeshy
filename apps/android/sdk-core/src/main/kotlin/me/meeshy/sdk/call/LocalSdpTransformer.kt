package me.meeshy.sdk.call

import org.webrtc.SessionDescription

/**
 * Prise de réécriture du SDP LOCAL, appliquée à l'offre ou à la réponse que le moteur vient de créer
 * et AVANT qu'elle ne soit posée puis signalée (débit audio, codecs préférés, extensions). Le moteur
 * n'en fait rien par lui-même : la politique appartient à l'orchestrateur applicatif.
 */
public fun interface LocalSdpTransformer {
    public fun transform(description: SessionDescription): SessionDescription

    public companion object {
        /** Aucune réécriture : le comportement historique. */
        public val Identity: LocalSdpTransformer = LocalSdpTransformer { it }
    }
}
