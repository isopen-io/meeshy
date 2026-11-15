package me.meeshy.sdk.model.speech

import me.meeshy.sdk.model.media.MediaPermissionState

/**
 * L'état de l'accès à la reconnaissance vocale. Miroir de `TranscriptionPermission` d'iOS ;
 * sur Android il se lit sur RECORD_AUDIO (pas d'autorisation « Speech » distincte).
 */
enum class TranscriptionPermission {
    NOT_DETERMINED,
    AUTHORIZED,
    DENIED,
    RESTRICTED;

    val isUsable: Boolean get() = this == AUTHORIZED

    companion object {
        /** Projette l'état unique de RECORD_AUDIO ([MediaPermissionState]). */
        fun fromRecordAudio(state: MediaPermissionState): TranscriptionPermission = when (state) {
            MediaPermissionState.NOT_DETERMINED -> NOT_DETERMINED
            MediaPermissionState.GRANTED, MediaPermissionState.LIMITED -> AUTHORIZED
            MediaPermissionState.DENIED -> DENIED
            MediaPermissionState.RESTRICTED -> RESTRICTED
        }
    }
}
