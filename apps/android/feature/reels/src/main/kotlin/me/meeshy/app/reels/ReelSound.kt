package me.meeshy.app.reels

import me.meeshy.sdk.model.ReelMediaLayout
import kotlin.math.abs

/**
 * Le bouton muet n'existe que si le réel porte du son (iOS `ReelFeedSoundButtonPolicy.showsSoundButton` :
 * « un bouton sur un clip sans piste est du chrome mort »). Loi pure, écrite une fois : l'écran ne la recalcule pas.
 */
internal object ReelSound {

    /**
     * Le son que le post DÉCLARE : l'audio d'un réel audio, les sons et les vidéos posées de sa scène. La vidéo de
     * FOND d'une scène n'en déclare aucun : comme la vidéo d'un réel simple, elle attend sa sonde.
     */
    fun declaresSound(reel: ReelPresentation): Boolean {
        val scene = reel.scene
        if (scene != null) {
            return scene.backgroundAudioUrl != null || scene.foregroundAudioUrl != null ||
                scene.foregroundMedia.any { it.isVideo }
        }
        return reel.layout is ReelMediaLayout.AudioOnly || reel.layout is ReelMediaLayout.ImagesWithAudio
    }

    /**
     * [probedAudioTrack] : la piste audio que le lecteur a trouvée dans la vidéo — celle du réel, ou le fond de sa
     * scène (`null` tant qu'il ne l'a pas sondée — pas de bouton avant de savoir). Une vidéo sans piste ne montre
     * jamais de bouton.
     */
    fun showsMuteButton(reel: ReelPresentation, probedAudioTrack: Boolean?): Boolean =
        declaresSound(reel) || (probesVideo(reel) && probedAudioTrack == true)

    private fun probesVideo(reel: ReelPresentation): Boolean {
        val scene = reel.scene ?: return reel.layout is ReelMediaLayout.Video
        return scene.backgroundVideoUrl != null
    }
}

/**
 * La fenêtre de décodage du fil (iOS `ReelPreloadWindow`, palier « décode » N±1) : la page affichée ET ses deux
 * voisines ont leur lecteur prêt, si bien que ni l'avance ni le retour à un réel n'attend un chargement.
 */
internal object ReelPreload {
    fun loads(page: Int, currentPage: Int, isForeground: Boolean): Boolean =
        isForeground && abs(page - currentPage) <= 1
}
