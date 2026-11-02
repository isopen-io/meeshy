package me.meeshy.sdk.model.speech

/**
 * A-t-on le droit de démarrer une capture sur ce format audio ? Miroir de
 * `AudioTapFormatReadiness` d'iOS : une route micro qui disparaît (écouteurs retirés,
 * appel GSM) rend un format à 0 Hz / 0 canal ; démarrer dessus plante la capture. La
 * prévention s'écrit devant l'appel, ici, en règle pure.
 */
object AudioInputFormatReadiness {
    fun mayStart(sampleRate: Double, channelCount: Int): Boolean =
        sampleRate.isFinite() && sampleRate > 0.0 && channelCount > 0
}
