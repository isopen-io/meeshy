package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryMediaObject

/**
 * Piste dont le volume d'auteur est persisté et se coupe d'un seul bouton — miroir de
 * `StoryVolumeCarrying` (`MeeshySDK/Models/StoryVolumeCarrying.swift`).
 *
 * `volume == 0` EST l'état muet persistant (aucun booléen séparé). Le mémento ne sert
 * qu'à restaurer le niveau précédent ; invariant : `mutedVolumeMemento != null => volume == 0`.
 */
interface StoryVolumeCarrying {
    val volume: Float
    val mutedVolumeMemento: Float?

    val isMuted: Boolean get() = volume <= 0f
}

/** Couple (volume, mémento) : la valeur que les deux types porteurs réécrivent. */
data class StoryVolumeState(val volume: Float, val mutedVolumeMemento: Float?)

object StoryVolumeCarryingLaw {

    /**
     * Passer à 0 depuis un niveau audible mémorise ce niveau ; tout niveau audible
     * efface le mémento (le réglage manuel prime sur l'historique de mute).
     */
    fun setVolume(current: StoryVolumeState, newVolume: Float): StoryVolumeState {
        val clamped = if (newVolume.isNaN()) 0f else maxOf(0f, newVolume)
        return when {
            clamped > 0f -> StoryVolumeState(clamped, null)
            current.volume > 0f -> StoryVolumeState(0f, current.volume)
            else -> StoryVolumeState(0f, current.mutedVolumeMemento)
        }
    }

    /** Mute : volume 0 (niveau mémorisé). Unmute : restaure le mémento, `1.0` en dernier recours. */
    fun toggleMute(current: StoryVolumeState): StoryVolumeState {
        if (current.volume > 0f) return setVolume(current, 0f)
        val restored = current.mutedVolumeMemento ?: 1f
        return setVolume(current, if (restored > 0f) restored else 1f)
    }
}

private fun StoryVolumeCarrying.state() = StoryVolumeState(volume, mutedVolumeMemento)

fun StoryMediaObject.withVolumePreservingMuteMemento(newVolume: Float): StoryMediaObject =
    StoryVolumeCarryingLaw.setVolume(state(), newVolume).let { copy(volume = it.volume, mutedVolumeMemento = it.mutedVolumeMemento) }

fun StoryMediaObject.toggledMute(): StoryMediaObject =
    StoryVolumeCarryingLaw.toggleMute(state()).let { copy(volume = it.volume, mutedVolumeMemento = it.mutedVolumeMemento) }

fun StoryAudioPlayerObject.withVolumePreservingMuteMemento(newVolume: Float): StoryAudioPlayerObject =
    StoryVolumeCarryingLaw.setVolume(state(), newVolume).let { copy(volume = it.volume, mutedVolumeMemento = it.mutedVolumeMemento) }

fun StoryAudioPlayerObject.toggledMute(): StoryAudioPlayerObject =
    StoryVolumeCarryingLaw.toggleMute(state()).let { copy(volume = it.volume, mutedVolumeMemento = it.mutedVolumeMemento) }
