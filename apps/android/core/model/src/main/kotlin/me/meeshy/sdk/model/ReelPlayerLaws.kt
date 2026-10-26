package me.meeshy.sdk.model

/**
 * Ce que fait un toucher sur le contenu d'un réel (iOS `ReelPageView.handleContentTap`) : chrome
 * effacé (mode immersif), il ne fait QUE le rendre ; sinon il bascule lecture/pause d'un réel qui
 * a une piste à jouer. Jamais les deux dans le même toucher.
 */
public object ReelContentTap {
    public enum class Outcome { RESTORE_CHROME, TOGGLE_PLAYBACK, NONE }

    public fun outcome(chromeHidden: Boolean, hasPlayableMedia: Boolean): Outcome = when {
        chromeHidden -> Outcome.RESTORE_CHROME
        hasPlayableMedia -> Outcome.TOGGLE_PLAYBACK
        else -> Outcome.NONE
    }
}

/** Les arithmétiques de la barre de lecture (iOS `ReelScrubBar`), pures et bornées. */
public object ReelScrub {
    public fun fraction(x: Float, width: Float): Float =
        if (width <= 0f) 0f else (x / width).coerceIn(0f, 1f)

    public fun seekMs(fraction: Float, durationMs: Long): Long? =
        if (durationMs <= 0L) null else (fraction.coerceIn(0f, 1f).toDouble() * durationMs).toLong()

    public fun progress(positionMs: Long, durationMs: Long): Float =
        if (durationMs <= 0L) 0f else (positionMs.toFloat() / durationMs).coerceIn(0f, 1f)
}

/**
 * Le menu « … » d'un réel (iOS `ReelMoreOptionsMenu`) : ouvrir, copier le texte, partager ; puis,
 * pour son propre réel, épingler et supprimer, sinon signaler. « Sauvegarder » et « Modifier »
 * n'y sont pas encore (issues de suivi).
 */
public object ReelMenu {
    public enum class Action { OPEN, COPY_TEXT, SHARE, PIN, DELETE, REPORT }

    public fun actions(isOwn: Boolean, hasText: Boolean): List<Action> = buildList {
        add(Action.OPEN)
        if (hasText) add(Action.COPY_TEXT)
        add(Action.SHARE)
        if (isOwn) {
            add(Action.PIN)
            add(Action.DELETE)
        } else {
            add(Action.REPORT)
        }
    }
}

/** La légende d'un réel et ses drapeaux de langue (iOS `ReelMetaRow` + `displayedDescription`). */
public object ReelCaption {
    private const val MAX_FLAGS: Int = 4

    public fun codes(original: String?, translationLanguages: Collection<String>): List<String> {
        val seen = mutableSetOf<String>()
        val ordered = mutableListOf<String>()
        fun add(raw: String?) {
            val code = raw?.takeIf { it.isNotEmpty() } ?: return
            if (seen.add(code.lowercase())) ordered.add(code)
        }
        add(original)
        translationLanguages.sorted().forEach(::add)
        return ordered.take(MAX_FLAGS)
    }

    public fun displayed(
        selected: String?,
        originalLanguage: String?,
        original: String?,
        translations: Map<String, String>,
        served: String?,
    ): String? {
        val chosen = selected?.lowercase() ?: return served
        if (chosen == originalLanguage?.lowercase()) return original ?: served
        return translations.entries.firstOrNull { it.key.lowercase() == chosen }?.value ?: served
    }

    public fun toggled(current: String?, tapped: String): String? =
        if (current?.lowercase() == tapped.lowercase()) null else tapped
}
