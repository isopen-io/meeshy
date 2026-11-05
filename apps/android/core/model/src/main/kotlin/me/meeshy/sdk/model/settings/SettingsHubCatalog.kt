package me.meeshy.sdk.model.settings

/** Retour haptique d'une rangée du hub Réglages : léger à la navigation, lourd à l'acte destructif. */
public enum class SettingsHubHaptic { LIGHT, HEAVY }

/** Sections du hub Réglages, dans l'ordre d'iOS `SettingsView` (la carte profil est rendue à part, en tête). */
public enum class SettingsHubSectionId {
    ACCOUNT,
    APPEARANCE,
    VOICE,
    TRANSCRIPTION,
    NOTIFICATIONS,
    DATA,
    TOOLS,
    HELP,
    ABOUT,
    SIGN_OUT,
}

/** Rangées du hub ; chacune ouvre une destination ou porte un interrupteur / un sélecteur. */
public enum class SettingsHubRowId {
    PRIVACY,
    SECURITY,
    BLOCKED_USERS,
    DELETE_ACCOUNT,
    THEME,
    INTERFACE_LANGUAGE,
    REGIONAL_LANGUAGE,
    INTERFACE_FEATURES,
    VOICE_PROFILE_MANAGE,
    VOICE_PROFILE_CREATE,
    TRANSCRIPTION_AUTO,
    TRANSCRIPTION_ENGINE,
    NOTIF_PUSH,
    NOTIF_SOUNDS,
    NOTIF_VIBRATIONS,
    NOTIF_MORE_OPTIONS,
    STORAGE,
    MEDIA_DOWNLOAD,
    PACKS,
    EXPORT_DATA,
    STARRED,
    SAVED,
    STATS,
    PROGRESSION,
    SHARE_LINKS,
    HELP_CENTER,
    ABOUT_MEESHY,
    TERMS,
    PRIVACY_POLICY,
    LICENSES,
    DIAGNOSTICS,
    VERSION,
    SIGN_OUT,
}

public data class SettingsHubRow(
    val id: SettingsHubRowId,
    val destructive: Boolean = false,
    val haptic: SettingsHubHaptic = SettingsHubHaptic.LIGHT,
)

public data class SettingsHubSection(
    val id: SettingsHubSectionId,
    val rows: List<SettingsHubRow>,
)

/**
 * Catalogue pur du hub Réglages (miroir de `SettingsView.swift`) : l'ordre des sections et des
 * rangées, les drapeaux destructifs et l'haptique y vivent ; les écrans ne font que le projeter.
 * Une section sans rangée rendable est masquée.
 */
public object SettingsHubCatalog {

    private fun nav(id: SettingsHubRowId) = SettingsHubRow(id)

    private fun destructive(id: SettingsHubRowId) =
        SettingsHubRow(id, destructive = true, haptic = SettingsHubHaptic.HEAVY)

    private val all: List<SettingsHubSection> = listOf(
        SettingsHubSection(
            SettingsHubSectionId.ACCOUNT,
            listOf(
                nav(SettingsHubRowId.PRIVACY),
                nav(SettingsHubRowId.SECURITY),
                nav(SettingsHubRowId.BLOCKED_USERS),
                destructive(SettingsHubRowId.DELETE_ACCOUNT),
            ),
        ),
        SettingsHubSection(
            SettingsHubSectionId.APPEARANCE,
            listOf(
                nav(SettingsHubRowId.THEME),
                nav(SettingsHubRowId.INTERFACE_LANGUAGE),
                nav(SettingsHubRowId.REGIONAL_LANGUAGE),
                nav(SettingsHubRowId.INTERFACE_FEATURES),
            ),
        ),
        SettingsHubSection(
            SettingsHubSectionId.VOICE,
            listOf(nav(SettingsHubRowId.VOICE_PROFILE_MANAGE), nav(SettingsHubRowId.VOICE_PROFILE_CREATE)),
        ),
        SettingsHubSection(
            SettingsHubSectionId.TRANSCRIPTION,
            listOf(nav(SettingsHubRowId.TRANSCRIPTION_AUTO), nav(SettingsHubRowId.TRANSCRIPTION_ENGINE)),
        ),
        SettingsHubSection(
            SettingsHubSectionId.NOTIFICATIONS,
            listOf(
                nav(SettingsHubRowId.NOTIF_PUSH),
                nav(SettingsHubRowId.NOTIF_SOUNDS),
                nav(SettingsHubRowId.NOTIF_VIBRATIONS),
                nav(SettingsHubRowId.NOTIF_MORE_OPTIONS),
            ),
        ),
        SettingsHubSection(
            SettingsHubSectionId.DATA,
            listOf(
                nav(SettingsHubRowId.STORAGE),
                nav(SettingsHubRowId.MEDIA_DOWNLOAD),
                nav(SettingsHubRowId.PACKS),
                nav(SettingsHubRowId.EXPORT_DATA),
            ),
        ),
        SettingsHubSection(
            SettingsHubSectionId.TOOLS,
            listOf(
                nav(SettingsHubRowId.STARRED),
                nav(SettingsHubRowId.SAVED),
                nav(SettingsHubRowId.STATS),
                nav(SettingsHubRowId.PROGRESSION),
                nav(SettingsHubRowId.SHARE_LINKS),
            ),
        ),
        SettingsHubSection(SettingsHubSectionId.HELP, listOf(nav(SettingsHubRowId.HELP_CENTER))),
        SettingsHubSection(
            SettingsHubSectionId.ABOUT,
            listOf(
                nav(SettingsHubRowId.ABOUT_MEESHY),
                nav(SettingsHubRowId.TERMS),
                nav(SettingsHubRowId.PRIVACY_POLICY),
                nav(SettingsHubRowId.LICENSES),
                nav(SettingsHubRowId.DIAGNOSTICS),
                SettingsHubRow(SettingsHubRowId.VERSION, haptic = SettingsHubHaptic.LIGHT),
            ),
        ),
        SettingsHubSection(SettingsHubSectionId.SIGN_OUT, listOf(destructive(SettingsHubRowId.SIGN_OUT))),
    )

    /** Sections dans l'ordre iOS, sans les rangées de [hidden] ; une section vidée disparaît. */
    public fun sections(hidden: Set<SettingsHubRowId> = emptySet()): List<SettingsHubSection> =
        all.mapNotNull { section ->
            val rows = section.rows.filterNot { it.id in hidden }
            if (rows.isEmpty()) null else section.copy(rows = rows)
        }
}
