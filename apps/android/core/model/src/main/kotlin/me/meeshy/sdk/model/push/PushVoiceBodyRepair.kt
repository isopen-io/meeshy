package me.meeshy.sdk.model.push

/**
 * Un vocal sans légende arrive au corps vide (vocal chiffré, transcription absente) : la bannière dit alors
 * « Message vocal · 0:12 » (iOS `audioBodyFallback`). Un corps déjà renseigné — une légende déchiffrée, une
 * transcription servie — n'est JAMAIS écrasé.
 */
public object PushVoiceBodyRepair {

    public fun repair(body: String?, mimeType: String?, durationMs: Long?, voiceLabel: String): String? {
        if (!body.isNullOrBlank()) return body
        val isAudio = mimeType?.substringBefore(';')?.trim()?.lowercase()?.startsWith("audio/") == true
        if (!isAudio) return body
        val seconds = durationMs?.takeIf { it > 0 }?.let { (it + 500) / 1_000 } ?: return voiceLabel
        return "$voiceLabel · ${seconds / 60}:${(seconds % 60).toString().padStart(2, '0')}"
    }
}
