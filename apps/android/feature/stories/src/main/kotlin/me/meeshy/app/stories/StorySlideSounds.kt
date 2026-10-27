package me.meeshy.app.stories

import me.meeshy.sdk.model.composer.sound.ApiSound
import me.meeshy.sdk.model.composer.sound.ComposerSoundPlacement
import me.meeshy.sdk.model.composer.sound.SoundPlacement

/** Au moins une slide porte un son (fond ou premier plan). */
val StorySlideDeck.hasSounds: Boolean get() = slides.any { it.audio.isNotEmpty() }

/**
 * Emprunte [sound] à l'étagère : il se pose en FOND de la slide sélectionnée (voir [ComposerSoundPlacement]).
 * Inerte — même instance — quand la scène a atteint son plafond de pistes.
 */
fun StorySlideDeck.borrowSoundOnSelected(sound: ApiSound): StorySlideDeck =
    when (val placed = ComposerSoundPlacement.borrow(selectedSlide.audio, sound)) {
        SoundPlacement.Refused -> this
        is SoundPlacement.Placed -> withSelectedAudio(placed.audios)
    }

fun StorySlideDeck.removeSelectedSound(id: String): StorySlideDeck =
    withSelectedAudio(ComposerSoundPlacement.remove(selectedSlide.audio, id))

/** Le muet LOCAL d'une piste : elle reste posée, son volume tombe à 0 avec mémento. */
fun StorySlideDeck.toggleSelectedSoundMute(id: String): StorySlideDeck =
    withSelectedAudio(ComposerSoundPlacement.toggleMute(selectedSlide.audio, id))

private fun StorySlideDeck.withSelectedAudio(audio: List<me.meeshy.sdk.model.StoryAudioPlayerObject>): StorySlideDeck {
    if (selectedSlide.audio == audio) return this
    val index = selectedIndex
    return copy(slides = slides.mapIndexed { i, slide -> if (i == index) slide.copy(audio = audio) else slide })
}
