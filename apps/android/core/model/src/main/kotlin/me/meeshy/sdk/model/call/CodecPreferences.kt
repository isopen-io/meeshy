package me.meeshy.sdk.model.call

/**
 * Les préférences de codec d'un appel, miroir de iOS `WebRTCCodecPreferences` : Opus puis RED pour l'audio ; H264, VP8,
 * VP9 pour la vidéo (H264 d'abord : encodeur matériel presque partout, et compatible Chrome et Safari ; AV1 exclu, son
 * support matériel est inégal). Appliquées à l'ordre des types de charge utile de chaque ligne `m=` — le SDP de la TOUTE
 * PREMIÈRE offre le porte déjà, sans attendre un transceiver. Un codec hors liste reste négociable, derrière.
 */
object CallCodecPreferences {
    val AUDIO: List<String> = listOf("opus", "red")
    val VIDEO: List<String> = listOf("H264", "VP8", "VP9")

    /** [available] réordonné : les codecs de [preferred] d'abord dans cet ordre, les autres à la suite dans le leur. */
    fun ordered(available: List<String>, preferred: List<String>): List<String> =
        available.sortedBy { name -> preferred.indexOfFirst { it.equals(name, ignoreCase = true) }.let { if (it < 0) Int.MAX_VALUE else it } }

    fun apply(sdp: String): String {
        val lines = sdp.split("\r\n")
        val sections = lines.indices.filter { lines[it].startsWith("m=") }
        val out = lines.toMutableList()
        sections.forEachIndexed { n, start ->
            val end = sections.getOrNull(n + 1) ?: lines.size
            val preferred = when {
                lines[start].startsWith("m=audio ") -> AUDIO
                lines[start].startsWith("m=video ") -> VIDEO
                else -> return@forEachIndexed
            }
            out[start] = reorder(lines[start], lines.subList(start + 1, end), preferred)
        }
        return out.joinToString("\r\n")
    }

    private fun reorder(mLine: String, section: List<String>, preferred: List<String>): String {
        val parts = mLine.split(' ')
        if (parts.size <= HEADER_TOKENS) return mLine
        val names = section.filter { it.startsWith("a=rtpmap:") }.associate {
            val body = it.removePrefix("a=rtpmap:")
            body.substringBefore(' ') to body.substringAfter(' ').substringBefore('/')
        }
        val retransmits = section.filter { it.startsWith("a=fmtp:") && it.contains("apt=") }.associate {
            val body = it.removePrefix("a=fmtp:")
            body.substringBefore(' ') to body.substringAfter("apt=").takeWhile { c -> c.isDigit() }
        }
        fun rank(pt: String): Int {
            val rtxOf = retransmits[pt]
            val name = if (rtxOf != null) names[rtxOf] else names[pt]
            val index = preferred.indexOfFirst { it.equals(name, ignoreCase = true) }
            return if (index < 0) Int.MAX_VALUE else index * 2 + if (rtxOf != null) 1 else 0
        }
        val ordered = parts.drop(HEADER_TOKENS).sortedBy(::rank)
        return (parts.take(HEADER_TOKENS) + ordered).joinToString(" ")
    }

    private const val HEADER_TOKENS = 3
}
