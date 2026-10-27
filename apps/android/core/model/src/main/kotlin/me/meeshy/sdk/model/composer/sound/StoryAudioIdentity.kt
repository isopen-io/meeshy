package me.meeshy.sdk.model.composer.sound

import me.meeshy.sdk.model.StoryAudioPlayerObject

/** Ce qu'une piste MONTRE d'elle-même — la somme ne porte que ce qui DIFFÈRE. */
sealed interface StoryAudioForm {
    /** Un son CAPTÉ : la note, l'onde ; ni titre ni auteur à créditer. */
    data object Recording : StoryAudioForm

    /** Un son EMPRUNTÉ : la note, son titre s'il en a un, son crédit — sans onde. */
    data class Borrowed(val title: String?, val credit: String?) : StoryAudioForm
}

/**
 * Site unique de « cette piste est-elle captée ou empruntée ? » — miroir de `StoryAudioIdentity` (iOS, directive
 * porteur 2026-09-01). **`soundId` décide, jamais la présence d'un titre** : un vocal NOMMÉ reste un enregistrement,
 * un emprunt sans titre reste un emprunt qui doit son crédit.
 */
object StoryAudioIdentity {
    fun form(audio: StoryAudioPlayerObject): StoryAudioForm {
        if (audio.soundId.isNullOrEmpty()) return StoryAudioForm.Recording
        return StoryAudioForm.Borrowed(title = nonEmpty(audio.name), credit = nonEmpty(audio.soundAuthorUsername))
    }

    fun isRecording(audio: StoryAudioPlayerObject): Boolean = form(audio) == StoryAudioForm.Recording

    /**
     * La pastille s'OUVRE-t-elle ? Non pour un emprunt : rouvrir passe par un FICHIER, qui détacherait la piste de
     * son `soundId`, donc de l'attribution de son auteur. Même lecture que [isRecording], autre conclusion.
     */
    fun opensEditor(audio: StoryAudioPlayerObject): Boolean = isRecording(audio)

    /** Titre et crédit joints (« Pulse · @belva ») ; vide pour un enregistrement. Sans la durée, qui ne se tronque jamais. */
    fun attribution(audio: StoryAudioPlayerObject): String {
        val borrowed = form(audio) as? StoryAudioForm.Borrowed ?: return ""
        return listOfNotNull(borrowed.title, borrowed.credit?.let { "@$it" }).joinToString(" · ")
    }

    fun showsWaveform(audio: StoryAudioPlayerObject): Boolean = isRecording(audio)
}

/** La composition textuelle d'une trace sonore — la locale n'intervient que sur la durée parlée, côté UI. */
object SoundCredit {
    /** « 0:12 » ; `null` quand inconnue — un « 0:00 » fabriqué se lit comme une piste vide. */
    fun durationLabel(audio: StoryAudioPlayerObject): String? {
        val seconds = audio.duration?.takeIf { it > 0f } ?: return null
        val total = Math.round(seconds)
        return "${total / 60}:${(total % 60).toString().padStart(2, '0')}"
    }

    fun label(audio: StoryAudioPlayerObject): String =
        listOf(StoryAudioIdentity.attribution(audio), durationLabel(audio).orEmpty())
            .filter { it.isNotEmpty() }
            .joinToString(" · ")
}

private fun nonEmpty(value: String?): String? = value?.trim()?.takeIf { it.isNotEmpty() }
