package me.meeshy.sdk.model.ongoing

/**
 * Les cinq notifications « en cours » de l'app. [notificationId] est stable par type : une mise à jour
 * remplace la notification au lieu d'en empiler une seconde. [priority] ordonne les types quand un seul
 * peut porter le premier plan : appel > enregistrement > partage d'écran > lecture > envoi.
 * [servedByHostService] dit si le service unique de l'hôte porte le premier plan de ce type ; les autres
 * gardent leur service dédié (appel, vocal, lecture, projection).
 */
enum class OngoingActivityKind(val notificationId: Int, val priority: Int, val servedByHostService: Boolean) {
    Call(0x4d43, 5, false),
    Recording(0x4d52, 4, false),
    ScreenShare(0x4d50, 3, false),
    Playback(0x4d4c, 2, false),
    Outbox(0x4d4f, 1, true),
}

/** Ce que le bouton d'une notification en cours demande à l'app (miroir de `LiveActivityCommand` iOS). */
enum class LiveActivityCommand(val wireName: String) {
    CallToggleMute("call_toggle_mute"),
    CallHangUp("call_hang_up"),
    PlaybackToggle("playback_toggle"),
    PlaybackClose("playback_close"),
    RecordingStop("recording_stop"),
    RecordingCancel("recording_cancel"),
    OutboxCancel("outbox_cancel"),
    ;

    companion object {
        fun fromWireName(name: String?): LiveActivityCommand? = entries.firstOrNull { it.wireName == name }
    }
}
