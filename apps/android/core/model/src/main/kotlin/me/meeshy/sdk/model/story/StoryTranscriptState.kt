package me.meeshy.sdk.model.story

import me.meeshy.sdk.model.StoryAudioTranscript
import me.meeshy.sdk.model.StoryEffects

/**
 * La transcription d'un vocal de story : éteinte par défaut, demandée par le menu ⋮, réinitialisée à chaque slide,
 * résolue par la chaîne du Prisme ([StoryAudioTranscript]). Quand elle porte du texte elle REMPLACE la légende : les deux
 * occupent la même bande basse et ne se chevauchent jamais. Miroir de `StoryReaderContentRules.voiceCaption` (iOS).
 */
data class StoryTranscriptState(val requested: Boolean = false, val slideId: String? = null) {

    fun toggled(): StoryTranscriptState = copy(requested = !requested)

    /** Une autre slide repart éteinte. */
    fun onSlide(id: String?): StoryTranscriptState = if (id == slideId) this else StoryTranscriptState(false, id)

    fun text(effects: StoryEffects?, languageChain: List<String>): String? {
        if (!requested || effects == null) return null
        return StoryAudioTranscript.resolve(effects, languageChain)?.content?.takeIf { it.isNotBlank() }
    }

    fun replacesCaption(effects: StoryEffects?, languageChain: List<String>): Boolean =
        text(effects, languageChain) != null

    companion object {
        /** Pilote l'entrée « Transcription » du menu : sans texte, la basculer n'afficherait rien. */
        fun isAvailable(effects: StoryEffects?): Boolean = StoryAudioTranscript.hasTranscript(effects)
    }
}
