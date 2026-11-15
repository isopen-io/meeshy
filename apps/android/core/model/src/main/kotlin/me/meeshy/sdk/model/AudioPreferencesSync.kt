package me.meeshy.sdk.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

private val audioPrefsJson = Json {
    ignoreUnknownKeys = true
    isLenient = true
    encodeDefaults = true
    explicitNulls = false
    coerceInputValues = true
}

/** Le jeton JSON persisté du bloc audio. */
public val AudioPreferences.storageValue: String
    get() = audioPrefsJson.encodeToString(this)

/**
 * Relit le jeton persisté. Absent, vide ou illisible ⇒ les défauts sûrs : un jeton corrompu ne
 * laisse jamais l'application sans configuration cohérente.
 */
public fun audioPreferencesFromStorage(raw: String?): AudioPreferences {
    val token = raw?.trim().orEmpty()
    if (token.isEmpty()) return AudioPreferences()
    return runCatching { audioPrefsJson.decodeFromString<AudioPreferences>(token) }
        .getOrElse { AudioPreferences() }
}

/**
 * Le corps de `PATCH /me/preferences/audio`. La passerelle FUSIONNE (`{ ...current, ...body }`) :
 * on n'envoie donc que ce que cet appareil règle — la transcription (activée, automatique sur les
 * vocaux reçus), la traduction audio, la synthèse vocale et le profil vocal, les quatre interrupteurs
 * qu'iOS pose d'un geste (`UserPreferencesManager.enableAllVoiceFeatures`) — et jamais les défauts
 * locaux des autres champs (voix, vitesse, qualité…), qui écraseraient ce que l'utilisateur a choisi
 * sur iOS ou le web. Les trois interrupteurs ajoutés sont nullables : `null` = « ne rien dire », car la
 * même classe relit une ligne de file écrite par un build antérieur (transcription automatique seule)
 * et une réponse de passerelle qui ne les porte pas — les rejouer ne doit rien inventer
 * ([toPreferences] garde alors la valeur locale). [from] les remplit toujours.
 * Sérialisé avec `encodeDefaults`, c'est à la fois la charge durable de la file et le corps envoyé.
 */
@Serializable
public data class AudioPreferenceSyncBody(
    val autoTranscribeIncoming: Boolean,
    val transcriptionEnabled: Boolean? = null,
    val audioTranslationEnabled: Boolean? = null,
    val ttsEnabled: Boolean? = null,
    val voiceProfileEnabled: Boolean? = null,
) {
    /** La projection inverse : la valeur de la passerelle replacée sur le bloc local (extras compris, intacts). */
    public fun toPreferences(current: AudioPreferences): AudioPreferences =
        current.copy(
            autoTranscribeIncoming = autoTranscribeIncoming,
            transcriptionEnabled = transcriptionEnabled ?: current.transcriptionEnabled,
            audioTranslationEnabled = audioTranslationEnabled ?: current.audioTranslationEnabled,
            ttsEnabled = ttsEnabled ?: current.ttsEnabled,
            voiceProfileEnabled = voiceProfileEnabled ?: current.voiceProfileEnabled,
        )

    public companion object {
        public fun from(prefs: AudioPreferences): AudioPreferenceSyncBody =
            AudioPreferenceSyncBody(
                autoTranscribeIncoming = prefs.autoTranscribeIncoming,
                transcriptionEnabled = prefs.transcriptionEnabled,
                audioTranslationEnabled = prefs.audioTranslationEnabled,
                ttsEnabled = prefs.ttsEnabled,
                voiceProfileEnabled = prefs.voiceProfileEnabled,
            )
    }
}
