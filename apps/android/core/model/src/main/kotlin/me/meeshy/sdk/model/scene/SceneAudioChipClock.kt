package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.StoryAudioPlayerObject

/**
 * Le chrono de la puce d'un son posé sur la scène (#16293, jumelle iOS #16294) : la position dans la passe qui sonne,
 * revenue à zéro à chaque tour quand le son boucle — la même loi que le mixeur ([SceneAudioLoopLaw]), lue sur l'écoulé
 * de la slide. Le compositeur et le lecteur la lisent tous deux (loi 6 : le player est l'aperçu).
 */
public object SceneAudioChipClock {

    public fun passSeconds(audio: StoryAudioPlayerObject): Double? = TODO()

    public fun positionSeconds(audio: StoryAudioPlayerObject, slideElapsed: Double, isEditPreview: Boolean = false): Double = TODO()

    public fun label(seconds: Double): String = TODO()
}
