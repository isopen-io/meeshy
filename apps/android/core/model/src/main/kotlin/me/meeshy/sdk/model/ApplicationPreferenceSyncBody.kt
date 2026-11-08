package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * Le corps de `PATCH /me/preferences/application`. La passerelle FUSIONNE : on n'envoie que le thème,
 * le seul réglage d'apparence que cet appareil édite. Le corps ne porte JAMAIS une clé de consentement
 * (`dataProcessingConsentAt`, `voiceDataConsentAt`, `voiceProfileConsentAt`, `voiceCloningConsentAt`,
 * `voiceCloningEnabledAt` : `z.never` côté passerelle depuis #4180, une seule suffit à refuser toute la
 * catégorie) ni `interfaceLanguage` (la langue d'interface est propre à l'appareil).
 */
@Serializable
public data class ApplicationPreferenceSyncBody(
    val theme: AppThemeMode,
) {
    /** La valeur de la passerelle replacée sur le bloc local, qui garde tout le reste (extras compris). */
    public fun toPreferences(current: ApplicationPreferences): ApplicationPreferences =
        current.copy(theme = theme)

    public companion object {
        public fun from(prefs: ApplicationPreferences): ApplicationPreferenceSyncBody =
            ApplicationPreferenceSyncBody(theme = prefs.theme)

        public fun from(theme: AppThemeMode): ApplicationPreferenceSyncBody =
            ApplicationPreferenceSyncBody(theme = theme)
    }
}
