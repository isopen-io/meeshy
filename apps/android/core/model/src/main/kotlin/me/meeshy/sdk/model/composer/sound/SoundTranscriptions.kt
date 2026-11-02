package me.meeshy.sdk.model.composer.sound

import me.meeshy.sdk.model.MobileTranscriptionPayload
import me.meeshy.sdk.model.MobileTranscriptionSegment
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.speech.OnDeviceTranscription

/**
 * La transcription d'un son de story — miroir de `AudioPostComposerView.buildPayload` et de
 * `ComposerForegroundSound.survivingTranscription` (iOS). Elle est rangée sous l'IDENTIFIANT de la piste : rogner (des
 * bornes, jamais un nouveau fichier), changer de rôle ou de niveau ne la touche pas, et elle part avec la piste quand
 * celle-ci quitte la diapo.
 */
object SoundTranscriptions {

    /** Ce que la reconnaissance sur l'appareil a entendu, sous la forme du fil (segments en secondes) ; rien entendu ⇒ `null`. */
    fun payload(heard: OnDeviceTranscription): MobileTranscriptionPayload? {
        val text = heard.text.trim().takeIf { it.isNotEmpty() } ?: return null
        return MobileTranscriptionPayload(
            text = text,
            language = heard.language,
            confidence = heard.confidence,
            segments = heard.segments.map { MobileTranscriptionSegment(text = it.text, start = it.startMs / 1000.0, end = it.endMs / 1000.0) },
        )
    }

    /** Ce que l'auteur a écrit lui-même : certain, sans segment ; un texte vide n'est pas une transcription. */
    fun manual(text: String, language: String): MobileTranscriptionPayload? =
        text.trim().takeIf { it.isNotEmpty() }?.let { MobileTranscriptionPayload(text = it, language = language, confidence = 1.0) }

    /** Écrite par l'auteur : certaine et sans segment (iOS `adopterTranscriptionManuelle`) ; entendue sinon. */
    fun isWritten(transcription: MobileTranscriptionPayload): Boolean =
        transcription.segments.isEmpty() && transcription.confidence == 1.0

    /**
     * Celle que la publication emporte : la passerelle la range sur le PREMIER média audio du post (`mediaIds`, dans
     * l'ordre des pistes). Une piste empruntée n'a pas de média ; si la première piste qui en a un n'a pas de
     * transcription, rien ne part et le serveur la transcrit — envoyer celle d'une autre piste l'étiquetterait faux.
     */
    fun published(audio: List<StoryAudioPlayerObject>, transcriptions: Map<String, MobileTranscriptionPayload>): MobileTranscriptionPayload? =
        audio.firstOrNull { it.postMediaId.isNotBlank() }?.let { transcriptions[it.id] }

    fun pruned(transcriptions: Map<String, MobileTranscriptionPayload>, audio: List<StoryAudioPlayerObject>): Map<String, MobileTranscriptionPayload> {
        val kept = audio.mapTo(mutableSetOf()) { it.id }
        return if (transcriptions.keys.all { it in kept }) transcriptions else transcriptions.filterKeys { it in kept }
    }
}
