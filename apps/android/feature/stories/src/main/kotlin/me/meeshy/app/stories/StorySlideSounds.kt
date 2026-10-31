package me.meeshy.app.stories

import me.meeshy.sdk.model.composer.sound.ApiSound
import me.meeshy.sdk.model.composer.sound.ComposerSoundPlacement
import me.meeshy.sdk.model.composer.sound.SoundPlacement
import me.meeshy.sdk.model.composer.sound.SoundTranscriptions

/** Au moins une slide porte un son (fond ou premier plan). */
val StorySlideDeck.hasSounds: Boolean get() = slides.any { it.audio.isNotEmpty() }

/**
 * Emprunte [sound] à l'étagère : il se pose en FOND de la slide sélectionnée (voir [ComposerSoundPlacement]).
 * Inerte — même instance — quand la scène a atteint son plafond de pistes.
 */
fun StorySlideDeck.borrowSoundOnSelected(sound: ApiSound): StorySlideDeck =
    when (val placed = ComposerSoundPlacement.borrow(selectedSlide.audio, sound, selectedSlide.mediaIds.size)) {
        SoundPlacement.Refused -> this
        is SoundPlacement.Placed -> withSelectedAudio(placed.audios).withSoundSource(sound.id, sound.durationMs)
    }

/** Retient la durée de source de la piste empruntée [soundId] — la fenêtre propre d'un son (#13601) se pose dessus. */
private fun StorySlideDeck.withSoundSource(soundId: String, durationMs: Long?): StorySlideDeck {
    val seconds = durationMs?.let { it / 1000f }?.takeIf { it.isFinite() && it > 0f } ?: return this
    val track = selectedSlide.audio.firstOrNull { it.soundId == soundId } ?: return this
    return withSoundSources(selectedSlide.soundSources + (track.id to seconds))
}

/** Retient la durée de source d'une piste de la slide sélectionnée (inerte pour une piste absente). */
fun StorySlideDeck.withSelectedSoundSource(trackId: String, seconds: Float): StorySlideDeck {
    if (selectedSlide.audio.none { it.id == trackId } || !seconds.isFinite() || seconds <= 0f) return this
    return withSoundSources(selectedSlide.soundSources + (trackId to seconds))
}

private fun StorySlideDeck.withSoundSources(sources: Map<String, Float>): StorySlideDeck {
    if (selectedSlide.soundSources == sources) return this
    val index = selectedIndex
    return copy(slides = slides.mapIndexed { i, slide -> if (i == index) slide.copy(soundSources = sources) else slide })
}

fun StorySlideDeck.removeSelectedSound(id: String): StorySlideDeck =
    withSelectedAudio(ComposerSoundPlacement.remove(selectedSlide.audio, id))

/** Le muet LOCAL d'une piste : elle reste posée, son volume tombe à 0 avec mémento. */
fun StorySlideDeck.toggleSelectedSoundMute(id: String): StorySlideDeck =
    withSelectedAudio(ComposerSoundPlacement.toggleMute(selectedSlide.audio, id))

/** Réécrit une piste de la slide sélectionnée (inerte, même instance, si elle n'y est pas). */
fun StorySlideDeck.updateSelectedSound(
    id: String,
    transform: (me.meeshy.sdk.model.StoryAudioPlayerObject) -> me.meeshy.sdk.model.StoryAudioPlayerObject,
): StorySlideDeck = withSelectedAudio(selectedSlide.audio.map { if (it.id == id) transform(it) else it })

internal fun StorySlideDeck.withSelectedAudio(audio: List<me.meeshy.sdk.model.StoryAudioPlayerObject>): StorySlideDeck {
    if (selectedSlide.audio == audio) return this
    val index = selectedIndex
    val kept = audio.mapTo(mutableSetOf()) { it.id }
    return copy(
        slides = slides.mapIndexed { i, slide ->
            if (i != index) {
                slide
            } else {
                slide.copy(
                    audio = slide.stackingNewVoices(audio),
                    soundSources = slide.soundSources.filterKeys { it in kept },
                    soundTranscriptions = SoundTranscriptions.pruned(slide.soundTranscriptions, audio),
                )
            }
        },
    )
}
