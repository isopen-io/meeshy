package me.meeshy.sdk.model.call

/**
 * Ce que je choisis AVANT de décrocher (vue P17, miroir de iOS `IncomingPreAnswer`) : un état local de l'écran entrant,
 * rien n'en part au pair avant le décroché. La caméra coupée passe par « Répondre sans vidéo », le micro coupé par la
 * coupure posée juste après la réponse.
 */
data class IncomingPreAnswer(
    val microphoneOn: Boolean = true,
    val cameraOn: Boolean = true,
) {
    /** Ce que l'autre recevra en décrochant, dit dans la barre. */
    enum class Exposure { SeenAndHeard, HeardOnly, SeenMuted, Neither }

    /** Le chemin que prend « Répondre ». */
    enum class Route { AsOffered, WithoutVideo }

    val answersMuted: Boolean get() = !microphoneOn

    fun togglingMicrophone(): IncomingPreAnswer = copy(microphoneOn = !microphoneOn)

    fun togglingCamera(): IncomingPreAnswer = copy(cameraOn = !cameraOn)

    /** Ma caméra filme vraiment : choisie ET vivante. Tant qu'elle démarre (ou si elle est refusée), ni la phrase ni le bouton ne promettent une image. */
    fun cameraFilms(isVideoCall: Boolean, hasLocalVideoTrack: Boolean): Boolean = isVideoCall && hasLocalVideoTrack && cameraOn

    /** « Vous verra » n'est promis que si une caméra tourne vraiment : refusée ou absente, l'autre ne verra que mon avatar. */
    fun exposure(isVideoCall: Boolean, hasLocalVideoTrack: Boolean): Exposure =
        when (cameraFilms(isVideoCall, hasLocalVideoTrack) to microphoneOn) {
            true to true -> Exposure.SeenAndHeard
            false to true -> Exposure.HeardOnly
            true to false -> Exposure.SeenMuted
            else -> Exposure.Neither
        }

    fun route(isVideoCall: Boolean): Route = if (isVideoCall && !cameraOn) Route.WithoutVideo else Route.AsOffered
}
