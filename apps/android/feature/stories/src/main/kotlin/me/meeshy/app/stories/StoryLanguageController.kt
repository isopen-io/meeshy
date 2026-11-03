package me.meeshy.app.stories

import me.meeshy.sdk.model.story.StoryViewerContentRules

/**
 * L'état d'exploration de langue du lecteur : l'override éphémère (lié à la slide où il a été choisi, il meurt
 * au changement de slide), les traductions demandées en vol et, par langue, la base d'une retraduction.
 * Pur — l'horloge est injectée (`CacheClock`), donc testable sans coroutine.
 */
class StoryLanguageController(private val nowMillis: () -> Long) {

    private var override: Pair<String, String>? = null
    private val translating = mutableSetOf<String>()
    private val retranslations = mutableMapOf<String, Retranslation>()

    private data class Retranslation(val baseline: String, val startedAt: Long)

    /** L'override vaut pour la slide [currentId] seulement ; une autre slide le réinitialise. */
    fun overrideFor(currentId: String?): String? {
        val held = override ?: return null
        if (held.first != currentId) {
            override = null
            return null
        }
        return held.second
    }

    /** Choix dans l'explorateur ou la barre : la langue s'affiche et se rechoisit. */
    fun select(storyId: String, code: String) {
        override = storyId to code
    }

    /** Geste sur une pastille : re-toucher la langue active la relâche (iOS `override(afterTapping:)`). */
    fun tap(storyId: String, code: String) {
        val current = overrideFor(storyId)
        override = StoryViewerContentRules.overrideAfterTapping(code, current)?.let { storyId to it }
    }

    fun beginTranslation(storyId: String, code: String): Boolean = translating.add(key(storyId, code))

    fun endTranslation(storyId: String, code: String) {
        translating.remove(key(storyId, code))
    }

    fun translatingCodes(storyId: String): Set<String> =
        translating.mapNotNullTo(mutableSetOf()) { entry ->
            entry.substringAfter('|', "").takeIf { it.isNotEmpty() && entry.substringBefore('|') == storyId }
        }

    fun isTranslating(storyId: String, code: String): Boolean = key(storyId, code) in translating

    /** « Retraduire » : on mémorise le texte de départ ; le spinner tient tant qu'il n'a pas changé (ou 20 s). */
    fun beginRetranslation(storyId: String, code: String, baselineText: String) {
        retranslations[key(storyId, code)] = Retranslation(baselineText, nowMillis())
    }

    /** Les langues dont la retraduction court encore, d'après le texte actuellement servi par [currentText]. */
    fun retranslatingCodes(storyId: String, currentText: (String) -> String?): Set<String> {
        val now = nowMillis()
        val result = mutableSetOf<String>()
        val iterator = retranslations.entries.iterator()
        while (iterator.hasNext()) {
            val (entryKey, retranslation) = iterator.next()
            if (entryKey.substringBefore('|') != storyId) continue
            val code = entryKey.substringAfter('|')
            val running = !StoryViewerContentRules.isRetranslationExpired(retranslation.startedAt, now) &&
                StoryViewerContentRules.isRetranslating(retranslation.baseline, currentText(code))
            if (running) result.add(code) else iterator.remove()
        }
        return result
    }

    private fun key(storyId: String, code: String): String = "$storyId|${code.trim().lowercase()}"
}
