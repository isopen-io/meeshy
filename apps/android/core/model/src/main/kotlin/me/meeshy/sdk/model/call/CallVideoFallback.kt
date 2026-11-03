package me.meeshy.sdk.model.call

/**
 * Pourquoi la vidéo locale n'a pas pu démarrer (miroir de iOS `CallVideoFallback`, #8788). Une caméra qui ne
 * démarre pas ne termine pas l'appel : il continue en audio, et le pair l'apprend comme une caméra coupée.
 */
enum class CallVideoFallback {
    CameraPermissionDenied,
    NoCamera,

    /** L'appareil est au palier thermique critique : la vidéo est coupée, l'appel continue en audio. */
    DeviceTooHot;

    /** Se dit à l'utilisateur : un refus d'accès (toast qui ouvre les Paramètres) ou la chaleur ; une absence de caméra n'a rien à réparer. */
    val warnsUser: Boolean get() = this == CameraPermissionDenied || this == DeviceTooHot
}
