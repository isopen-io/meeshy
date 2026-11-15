package me.meeshy.sdk.model.scene

/** Quand préparer, activer ou retenir le moteur audio — miroir de `StoryAudioActivationPolicy` (iOS). */
object AudioActivationPolicy {

    /** Un mute verrouillé (impossible à lever) ne prépare rien. */
    fun shouldPrepare(mute: Boolean, muteIsLocked: Boolean): Boolean = !(mute && muteIsLocked)

    fun shouldActivate(hasClips: Boolean, hasSoundingVideo: Boolean, mute: Boolean): Boolean =
        !mute && (hasClips || hasSoundingVideo)

    /** Des clips existent mais sont coupés : le moteur reste prêt pour une levée de mute sans latence. */
    fun shouldHoldEngine(hasClips: Boolean, isMuted: Boolean): Boolean = hasClips && isMuted

    /** Le mute global l'emporte sur toute piste ; lever le mute global ne réveille pas une piste coupée. */
    fun isTrackAudible(globalMute: Boolean, trackMuted: Boolean): Boolean = !globalMute && !trackMuted
}
