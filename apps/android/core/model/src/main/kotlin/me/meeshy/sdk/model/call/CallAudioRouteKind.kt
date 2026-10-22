package me.meeshy.sdk.model.call

/**
 * Le genre d'une sortie audio d'appel, déduit du type de périphérique de la plateforme
 * (`AudioDeviceInfo.TYPE_*`). Loi pure : les constantes sont recopiées ici pour que le calcul se
 * prouve sans Android. Miroir de `CallAudioPortKind` (iOS).
 */
public enum class CallAudioRouteKind {
    Earpiece,
    Speaker,
    Bluetooth,
    Wired,
    Usb,
    HearingAid,
    Car,
    Other,
    ;

    /** Vrai pour tout ce qui sort de l'appareil lui-même (casque, voiture, aide auditive…). */
    public val isExternal: Boolean
        get() = when (this) {
            Bluetooth, Wired, Usb, HearingAid, Car -> true
            Earpiece, Speaker, Other -> false
        }

    public companion object {
        private const val TYPE_BUILTIN_EARPIECE = 1
        private const val TYPE_BUILTIN_SPEAKER = 2
        private const val TYPE_WIRED_HEADSET = 3
        private const val TYPE_WIRED_HEADPHONES = 4
        private const val TYPE_LINE_ANALOG = 5
        private const val TYPE_LINE_DIGITAL = 6
        private const val TYPE_BLUETOOTH_SCO = 7
        private const val TYPE_BLUETOOTH_A2DP = 8
        private const val TYPE_USB_DEVICE = 11
        private const val TYPE_USB_ACCESSORY = 12
        private const val TYPE_BUS = 21
        private const val TYPE_USB_HEADSET = 22
        private const val TYPE_HEARING_AID = 23
        private const val TYPE_BUILTIN_SPEAKER_SAFE = 24
        private const val TYPE_BLE_HEADSET = 26
        private const val TYPE_BLE_SPEAKER = 27

        public fun fromDeviceType(deviceType: Int): CallAudioRouteKind = when (deviceType) {
            TYPE_BUILTIN_EARPIECE -> Earpiece
            TYPE_BUILTIN_SPEAKER, TYPE_BUILTIN_SPEAKER_SAFE -> Speaker
            TYPE_BLUETOOTH_SCO, TYPE_BLUETOOTH_A2DP, TYPE_BLE_HEADSET, TYPE_BLE_SPEAKER -> Bluetooth
            TYPE_WIRED_HEADSET, TYPE_WIRED_HEADPHONES, TYPE_LINE_ANALOG, TYPE_LINE_DIGITAL -> Wired
            TYPE_USB_DEVICE, TYPE_USB_ACCESSORY, TYPE_USB_HEADSET -> Usb
            TYPE_HEARING_AID -> HearingAid
            TYPE_BUS -> Car
            else -> Other
        }
    }
}
