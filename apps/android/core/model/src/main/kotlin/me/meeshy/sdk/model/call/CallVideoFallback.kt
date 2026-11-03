package me.meeshy.sdk.model.call

/**
 * Pourquoi la vidéo locale n'a pas pu démarrer (miroir de iOS `CallVideoFallback`, #8788). Une caméra qui ne
 * démarre pas ne termine pas l'appel : il continue en audio, et le pair l'apprend comme une caméra coupée.
 */
enum class CallVideoFallback {
    /** Un émulateur dont la caméra est fantôme (iOS `simulator`) : rien à réparer, rien à dire. */
    Emulator,
    CameraPermissionDenied,
    NoCamera,

    /** L'appareil est au palier thermique critique : la vidéo est coupée, l'appel continue en audio. */
    DeviceTooHot;

    /** Se dit à l'utilisateur : un refus d'accès (toast qui ouvre les Paramètres) ou la chaleur ; une absence de caméra n'a rien à réparer. */
    val warnsUser: Boolean get() = this == CameraPermissionDenied || this == DeviceTooHot

    companion object {
        /**
         * Le repli que dicte l'état de la caméra, ou `null` quand la vidéo peut démarrer. L'ordre est celui d'iOS :
         * un émulateur n'a pas de vraie caméra, puis le refus d'accès (réparable), puis l'absence de matériel.
         */
        fun resolve(cameraGranted: Boolean, hasCamera: Boolean = true, isEmulator: Boolean = false): CallVideoFallback? = when {
            isEmulator -> Emulator
            !cameraGranted -> CameraPermissionDenied
            !hasCamera -> NoCamera
            else -> null
        }
    }
}
