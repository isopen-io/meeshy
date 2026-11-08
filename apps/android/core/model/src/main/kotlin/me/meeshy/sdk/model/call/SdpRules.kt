package me.meeshy.sdk.model.call

/**
 * Les réécritures du SDP LOCAL, miroir de iOS `OpusFmtpMunger` (`CallDataProfile.swift`) et de `WebRTCSdpRules`
 * (`P2PWebRTCClient+SdpRules.swift`) : fmtp Opus voix selon le profil, extension transport-cc, indices de débit vidéo,
 * puis l'ordre des codecs ([CallCodecPreferences]). Pures : une chaîne en entrée, une chaîne en sortie.
 */
object CallSdpRules {
    private const val CRLF = "\r\n"
    private const val TRANSPORT_CC_URI = "http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01"

    /** Premier identifiant `extmap` à un octet tenté pour transport-cc (iOS `extmapStartId`). */
    const val EXTMAP_START_ID: Int = 5

    /** Dernier identifiant à un octet (RFC 5285) ; au-delà, la forme à deux octets n'est pas assez répandue. */
    const val EXTMAP_MAX_ID: Int = 14

    /** `x-google-max-bitrate` : le plafond de l'encodeur en boucle ouverte, avant la première estimation GCC. */
    const val VIDEO_MAX_BITRATE_KBPS: Int = 2_500

    /** `x-google-min-bitrate` : le plancher du palier critique, en kb/s. */
    const val VIDEO_MIN_BITRATE_KBPS: Int = 100

    /** Tout ce que l'offre ou la réponse locale reçoit avant d'être posée puis signalée. */
    fun transformLocal(sdp: String, audio: CallAudioBudget): String =
        CallCodecPreferences.apply(addVideoBitrateHints(addTransportCc(mungeOpus(sdp, audio))))

    /** Impose le fmtp Opus voix du budget : les clés déjà présentes sont remplacées, jamais dupliquées. */
    fun mungeOpus(sdp: String, audio: CallAudioBudget): String {
        val params = audio.fmtpParameters
        val lines = sdp.split(CRLF).toMutableList()
        val payloadType = lines
            .firstOrNull { it.startsWith("a=rtpmap:") && it.contains("opus/48000") }
            ?.removePrefix("a=rtpmap:")?.substringBefore(' ')
            ?: return sdp
        val prefix = "a=fmtp:$payloadType "
        val overridden = params.map(::keyOf).toSet()
        var found = false
        for (i in lines.indices) {
            val line = lines[i]
            if (!line.startsWith(prefix)) continue
            found = true
            val kept = line.removePrefix(prefix).split(';').map { it.trim() }
                .filter { it.isNotEmpty() && keyOf(it) !in overridden }
            lines[i] = prefix + (kept + params).joinToString(";")
        }
        if (!found) {
            val rtpmap = lines.indexOfFirst { it.startsWith("a=rtpmap:$payloadType ") }
            if (rtpmap >= 0) lines.add(rtpmap + 1, prefix + params.joinToString(";"))
        }
        return lines.joinToString(CRLF)
    }

    /** Déclare transport-cc sur chaque section audio et vidéo, sous le premier identifiant libre ; sinon ne touche à rien. */
    fun addTransportCc(sdp: String): String {
        if (sdp.contains(TRANSPORT_CC_URI)) return sdp
        val lines = sdp.split(CRLF).toMutableList()
        val used = lines.filter { it.startsWith("a=extmap:") }
            .mapNotNull { it.removePrefix("a=extmap:").substringBefore(' ').substringBefore('/').toIntOrNull() }
            .toSet()
        val id = generateSequence(EXTMAP_START_ID) { it + 1 }.first { it !in used }
        if (id > EXTMAP_MAX_ID) return sdp
        val extmap = "a=extmap:$id $TRANSPORT_CC_URI"
        val sections = lines.indices.filter { lines[it].startsWith("m=audio ") || lines[it].startsWith("m=video ") }
        // De la dernière section à la première : une insertion décale les lignes suivantes, jamais les index restants.
        for (m in sections.asReversed()) {
            var at = m + 1
            while (at < lines.size && !lines[at].startsWith("m=")) {
                if (lines[at].startsWith("a=extmap:")) { at++; continue }
                if (lines[at].startsWith("a=")) break
                at++
            }
            lines.add(at, extmap)
        }
        return lines.joinToString(CRLF)
    }

    /** Pose les bornes de débit dans chaque fmtp vidéo qui n'en porte pas encore. */
    fun addVideoBitrateHints(sdp: String): String {
        var inVideo = false
        return sdp.split(CRLF).joinToString(CRLF) { line ->
            if (line.startsWith("m=")) inVideo = line.startsWith("m=video ")
            if (inVideo && line.startsWith("a=fmtp:") && !line.contains("x-google-max-bitrate")) {
                "$line;x-google-max-bitrate=$VIDEO_MAX_BITRATE_KBPS;x-google-min-bitrate=$VIDEO_MIN_BITRATE_KBPS"
            } else {
                line
            }
        }
    }

    private fun keyOf(param: String): String = param.substringBefore('=')
}
