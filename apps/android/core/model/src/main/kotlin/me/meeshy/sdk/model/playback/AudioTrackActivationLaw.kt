package me.meeshy.sdk.model.playback

/**
 * **Un média muet ne décode pas sa piste audio** (iOS `AudioTrackActivationLaw`) : couper la sortie ne
 * coupe pas le décodage ; éteindre les PISTES audio (`setTrackTypeDisabled`) l'arrête à la source.
 *
 * - muet, les pistes audio s'éteignent ; audible, elles se rallument ; l'image n'est jamais touchée ;
 * - au mute la sortie se coupe AVANT la piste ; au démute la piste se rallume SOUS la sortie encore
 *   muette, puis la sortie s'ouvre : aucun claquement ;
 * - idempotent : la sortie déjà juste ne se réécrit pas, les pistes se réconcilient quand même.
 */
public object AudioTrackActivationLaw {

    public enum class Step { SILENCE_PLAYER, DISABLE_AUDIO_TRACKS, ENABLE_AUDIO_TRACKS, SOUND_PLAYER }

    public fun steps(playerIsMuted: Boolean, wantsMuted: Boolean): List<Step> = when {
        playerIsMuted == wantsMuted ->
            listOf(if (wantsMuted) Step.DISABLE_AUDIO_TRACKS else Step.ENABLE_AUDIO_TRACKS)
        wantsMuted -> listOf(Step.SILENCE_PLAYER, Step.DISABLE_AUDIO_TRACKS)
        else -> listOf(Step.ENABLE_AUDIO_TRACKS, Step.SOUND_PLAYER)
    }

    /** Les pistes audio sont désactivées exactement quand la sortie effective est muette. */
    public fun audioTracksDisabled(effectiveMuted: Boolean): Boolean = effectiveMuted
}
