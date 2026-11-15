package me.meeshy.app.stories

import me.meeshy.sdk.model.MobileTranscriptionPayload
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryObjectPlacement
import me.meeshy.sdk.model.composer.sound.ComposerAudioRole
import me.meeshy.sdk.model.composer.sound.ComposerSoundRoles
import me.meeshy.sdk.model.composer.sound.SoundLanguageChoices
import me.meeshy.sdk.model.composer.sound.SoundPlacement
import me.meeshy.sdk.model.composer.sound.SoundTranscriptions

/**
 * Un son que la feuille « Son de la story » a fini de préparer (#13848) : enregistré au micro ou importé, déjà téléversé
 * ([postMediaId], [url]), avec sa durée, son onde, sa langue et la transcription faite sur l'appareil (ou écrite).
 */
data class ComposedStorySound(
    val trackId: String,
    val postMediaId: String,
    val url: String,
    val durationSeconds: Float?,
    val waveform: List<Float>,
    val language: String,
    val transcription: MobileTranscriptionPayload?,
)

/** Pose [sound] dans [role] sur la slide sélectionnée ; même instance au plafond des sons. */
fun StorySlideDeck.placeComposedSoundOnSelected(sound: ComposedStorySound, role: ComposerAudioRole): StorySlideDeck {
    val track = StoryAudioPlayerObject(
        id = sound.trackId,
        postMediaId = sound.postMediaId,
        mediaURL = sound.url,
        waveformSamples = sound.waveform,
        duration = sound.durationSeconds,
        sourceLanguage = SoundLanguageChoices.normalized(sound.language),
    )
    val placed = ComposerSoundRoles.place(selectedSlide.audio, track, role, soundLanding()) as? SoundPlacement.Placed ?: return this
    val withTrack = withSelectedAudio(placed.audios)
    val timed = sound.durationSeconds?.let { withTrack.withSelectedSoundSource(track.id, it) } ?: withTrack
    return sound.transcription?.let { timed.withSelectedSoundTranscription(track.id, it) } ?: timed
}

fun StorySlideDeck.withSelectedSoundRole(id: String, role: ComposerAudioRole): StorySlideDeck =
    withSelectedAudio(ComposerSoundRoles.withRole(selectedSlide.audio, id, role, soundLanding()))

fun StorySlideDeck.withSelectedSoundVolume(id: String, volume: Float): StorySlideDeck =
    withSelectedAudio(ComposerSoundRoles.withVolume(selectedSlide.audio, id, volume))

/**
 * La langue du son se pose sur la piste. Ce que l'auteur a ÉCRIT prend la nouvelle étiquette ; ce que l'appareil a
 * ENTENDU dans l'ancienne langue part (le fichier n'est plus là pour le refaire, et un texte reconnu dans une langue
 * étiqueté dans une autre fausserait le Prisme) : la passerelle le transcrira à la publication.
 */
fun StorySlideDeck.withSelectedSoundLanguage(id: String, language: String): StorySlideDeck {
    val relabeled = withSelectedAudio(ComposerSoundRoles.withLanguage(selectedSlide.audio, id, language))
    val code = relabeled.selectedSlide.audio.firstOrNull { it.id == id }?.sourceLanguage ?: return relabeled
    val text = relabeled.selectedSlide.soundTranscriptions[id]?.takeIf { it.language != code } ?: return relabeled
    return relabeled.withSelectedSoundTranscription(id, text.copy(language = code).takeIf { SoundTranscriptions.isWritten(text) })
}

/** Écrit (ou retire, `null`) la transcription de la piste [id] ; inerte pour une piste absente. */
fun StorySlideDeck.withSelectedSoundTranscription(id: String, transcription: MobileTranscriptionPayload?): StorySlideDeck {
    if (selectedSlide.audio.none { it.id == id }) return this
    val current = selectedSlide.soundTranscriptions
    val next = if (transcription == null) current - id else current + (id to transcription)
    if (next == current) return this
    return withSelectedSlide { it.copy(soundTranscriptions = next) }
}

fun StorySlideDeck.withSelectedVideosDuck(ducks: Boolean): StorySlideDeck =
    if (selectedSlide.videosDuckUnderSound == ducks) this else withSelectedSlide { it.copy(videosDuckUnderSound = ducks) }

/** Où un son de scène se pose : la cascade de la diapo, puces sonores déjà posées comprises (iOS `ComposerSoundPromotion.landing`). */
private fun StorySlideDeck.soundLanding(): StoryObjectPlacement.Point = StoryObjectPlacement.next(
    selectedSlide.elements.map { StoryObjectPlacement.Point(it.x.toDouble(), it.y.toDouble()) } +
        selectedSlide.stickers.map { StoryObjectPlacement.Point(it.x.toDouble(), it.y.toDouble()) } +
        selectedSlide.placedMedia.map { StoryObjectPlacement.Point(it.x.toDouble(), it.y.toDouble()) } +
        selectedSlide.audio.filter { it.isBackground != true }.map { StoryObjectPlacement.Point(it.x, it.y) },
)

private fun StorySlideDeck.withSelectedSlide(transform: (StorySlide) -> StorySlide): StorySlideDeck {
    val index = selectedIndex
    return copy(slides = slides.mapIndexed { i, slide -> if (i == index) transform(slide) else slide })
}
