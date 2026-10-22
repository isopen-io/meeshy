package me.meeshy.sdk.model.fullscreen

/**
 * Où mène le bouton « Sortie audio » du plein écran — la place d'AirPlay (`AirPlayRoutePicker`,
 * iOS) sur Android. Une loi pure de la version du système : le sélecteur de sortie du système
 * n'est ouvrable par une application que depuis l'API 34, avant quoi le bouton mène aux réglages
 * Bluetooth, d'où l'on choisit l'enceinte ou le casque.
 */
public enum class AudioOutputRoute {
    /** Le sélecteur de sortie multimédia du système (API 34+). */
    SystemOutputSwitcher,

    /** Les réglages Bluetooth du système (API 26 à 33). */
    BluetoothSettings;

    public companion object {
        public const val SYSTEM_SWITCHER_MIN_SDK: Int = 34

        public fun forSdk(sdkInt: Int): AudioOutputRoute =
            if (sdkInt >= SYSTEM_SWITCHER_MIN_SDK) SystemOutputSwitcher else BluetoothSettings
    }
}
