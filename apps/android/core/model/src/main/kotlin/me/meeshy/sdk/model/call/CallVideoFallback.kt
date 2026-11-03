package me.meeshy.sdk.model.call

/**
 * Pourquoi la vidéo locale n'a pas pu démarrer (miroir de iOS `CallVideoFallback`, #8788). Une caméra qui ne
 * démarre pas ne termine pas l'appel : il continue en audio, et le pair l'apprend comme une caméra coupée.
 */
enum class CallVideoFallback {
    CameraPermissionDenied,
    NoCamera;

    /** Seul un refus d'accès se dit à l'utilisateur (toast qui ouvre les Paramètres) : une absence de caméra n'a rien à réparer. */
    val warnsUser: Boolean get() = this == CameraPermissionDenied
}
