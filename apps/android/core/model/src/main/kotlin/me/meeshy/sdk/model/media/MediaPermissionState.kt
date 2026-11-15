package me.meeshy.sdk.model.media

/**
 * Le vocabulaire unique de l'état d'un accès appareil (caméra, micro, photothèque,
 * lieu, notifications, contacts). Miroir de `MediaPermissionState` du SDK iOS
 * (`packages/MeeshySDK/.../Media/DevicePermissions.swift`).
 *
 * Android n'expose pas la distinction `notDetermined` / `denied` : `checkSelfPermission`
 * ne rend qu'un booléen. Elle se reconstruit à partir de l'historique des demandes et de
 * `shouldShowRequestPermissionRationale` (voir `PermissionSnapshot.state`), de sorte que
 * les trois décisions ci-dessous se répondent au même endroit pour tous les appelants.
 */
enum class MediaPermissionState {
    /** Jamais demandé, ou refusé une fois avec une explication encore possible : on peut demander. */
    NOT_DETERMINED,

    /** Accordé en entier. */
    GRANTED,

    /**
     * Photothèque seulement : l'utilisateur a accordé une sélection (`READ_MEDIA_VISUAL_USER_SELECTED`,
     * API 34). C'est un accès accordé, pas un refus.
     */
    LIMITED,

    /** Refus définitif : plus aucune boîte système ne s'affichera, seul le réglage de l'app change l'issue. */
    DENIED,

    /** Bloqué par une politique (profil géré, administrateur) : jamais invitable, les Réglages sont l'unique recours. */
    RESTRICTED;

    /** La ressource est utilisable maintenant. */
    val isUsable: Boolean get() = this == GRANTED || this == LIMITED

    /** La boîte système peut encore être affichée : une demande dans l'app a un sens. */
    val canPrompt: Boolean get() = this == NOT_DETERMINED

    /** Le seul recours qui reste est l'écran de réglages de l'application. */
    val needsSettingsRedirect: Boolean get() = this == DENIED || this == RESTRICTED
}
