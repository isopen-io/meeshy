package me.meeshy.sdk.call

import me.meeshy.sdk.model.call.CallDataProfile
import me.meeshy.sdk.model.call.CallSdpRules
import org.webrtc.SessionDescription

/**
 * La réécriture du SDP local d'un appel (iOS `mungeAndSetLocal`) : fmtp Opus voix du PROFIL COURANT (mono, DTX, FEC),
 * transport-cc, indices de débit vidéo, H264 d'abord. Le profil se pose avant la première offre ([profile]) ; la
 * prochaine description locale (offre, réponse, redémarrage ICE) porte alors le bon fmtp, sans renégociation forcée.
 */
public class DataProfileSdpTransformer : LocalSdpTransformer {
    @Volatile
    public var profile: CallDataProfile = CallDataProfile.WIFI

    override fun transform(description: SessionDescription): SessionDescription {
        if (description.description.isEmpty()) return description
        return SessionDescription(description.type, CallSdpRules.transformLocal(description.description, profile.budget.audio))
    }
}
