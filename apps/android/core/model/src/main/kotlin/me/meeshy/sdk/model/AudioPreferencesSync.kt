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
 * on n'envoie donc que ce que cet appareil règle — aujourd'hui la transcription automatique des
 * vocaux entrants (iOS `SettingsView`, `audio.autoTranscribeIncoming`) — et jamais les défauts
 * locaux des autres champs, qui écraseraient ce que l'utilisateur a choisi sur iOS ou le web.
 * Sérialisé avec `encodeDefaults`, c'est à la fois la charge durable de la file et le corps envoyé.
 */
@Serializable
public data class AudioPreferenceSyncBody(
    val autoTranscribeIncoming: Boolean,
) {
    /** La projection inverse : la valeur de la passerelle replacée sur le bloc local. */
    public fun toPreferences(current: AudioPreferences): AudioPreferences =
        current.copy(autoTranscribeIncoming = autoTranscribeIncoming)

    public companion object {
        public fun from(prefs: AudioPreferences): AudioPreferenceSyncBody =
            AudioPreferenceSyncBody(autoTranscribeIncoming = prefs.autoTranscribeIncoming)
    }
}
