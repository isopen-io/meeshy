package me.meeshy.sdk.model

import kotlin.math.max
import kotlin.math.min

/**
 * The seven-step sentiment scale surfaced by the composer's live emoji.
 *
 * Faithful port of iOS `SentimentLevel` (`TextAnalyzer.swift`): same seven buckets,
 * same glyphs, same [from] thresholds. The UI layer resolves each level to its
 * localized label; [emoji] is the decorative glyph shown beside the composer.
 */
enum class SentimentLevel(val emoji: String) {
    VERY_NEGATIVE("😡"),
    NEGATIVE("😠"),
    SLIGHTLY_NEGATIVE("😕"),
    NEUTRAL("😐"),
    SLIGHTLY_POSITIVE("🙂"),
    POSITIVE("😊"),
    VERY_POSITIVE("🤩"),
    ;

    companion object {
        /**
         * Buckets a normalized sentiment [score] in `[-1, 1]` into a [SentimentLevel].
         * Boundaries match iOS exactly: the neutral band is `[-0.1, 0.1]` (both ends
         * inclusive), `-0.6` reads as [NEGATIVE], `-0.3` as [SLIGHTLY_NEGATIVE], `0.3`
         * as [POSITIVE], and `0.6` as [VERY_POSITIVE].
         */
        fun from(score: Double): SentimentLevel = when {
            score < -0.6 -> VERY_NEGATIVE
            score < -0.3 -> NEGATIVE
            score < -0.1 -> SLIGHTLY_NEGATIVE
            score <= 0.1 -> NEUTRAL
            score < 0.3 -> SLIGHTLY_POSITIVE
            score < 0.6 -> POSITIVE
            else -> VERY_POSITIVE
        }
    }
}

/**
 * Pure, on-device sentiment scorer — a faithful port of iOS
 * `TextAnalyzer.computeSentiment` (`packages/MeeshySDK/Sources/MeeshyUI/Utilities/
 * TextAnalyzer.swift`). Lowercases the text, tokenizes on whitespace with
 * leading/trailing punctuation trimmed, sums the weighted FR/EN/ES/DE dictionary
 * hits (positive dictionary consulted first), normalizes by word count
 * (`sum / count * 2`), and clamps into `[-1, 1]`.
 *
 * This is the composer's live scorer (`SmartContextZone`), distinct from the
 * message-detail sheet's `NLTagger` (Apple ML) scorer, which has no portable
 * Android equivalent and is deliberately out of scope. Stateless building block:
 * it takes text and returns a score, encoding no "when to show it" decision — that
 * orchestration stays in the ViewModel.
 */
object SentimentAnalyzer {

    /** Normalized sentiment of [text] in `[-1, 1]`; `0.0` for empty/wordless input. */
    fun score(text: String): Double {
        val words = text.lowercase()
            .split(WHITESPACE)
            .map { it.trim(::isTrimmablePunctuation) }
            .filter { it.isNotEmpty() }
        if (words.isEmpty()) return 0.0

        var sum = 0.0
        for (word in words) {
            val weight = POSITIVE_WORDS[word] ?: NEGATIVE_WORDS[word]
            if (weight != null) sum += weight
        }
        return max(-1.0, min(1.0, sum / words.size * 2.0))
    }

    private val WHITESPACE = Regex("\\s+")

    private val PUNCTUATION_CATEGORIES = setOf(
        CharCategory.CONNECTOR_PUNCTUATION,
        CharCategory.DASH_PUNCTUATION,
        CharCategory.START_PUNCTUATION,
        CharCategory.END_PUNCTUATION,
        CharCategory.INITIAL_QUOTE_PUNCTUATION,
        CharCategory.FINAL_QUOTE_PUNCTUATION,
        CharCategory.OTHER_PUNCTUATION,
    )

    private fun isTrimmablePunctuation(c: Char): Boolean = c.category in PUNCTUATION_CATEGORIES

    private val POSITIVE_WORDS: Map<String, Double> = mapOf(
        "love" to 0.8, "amazing" to 0.7, "great" to 0.6, "awesome" to 0.7, "excellent" to 0.7,
        "wonderful" to 0.7, "fantastic" to 0.7, "beautiful" to 0.6, "happy" to 0.6, "good" to 0.4,
        "nice" to 0.4, "best" to 0.6, "perfect" to 0.7, "thanks" to 0.4, "thank" to 0.4,
        "cool" to 0.4, "brilliant" to 0.7, "superb" to 0.7, "glad" to 0.5, "enjoy" to 0.5,
        "fun" to 0.5, "like" to 0.3, "yes" to 0.2, "wow" to 0.5, "bravo" to 0.6,
        "incredible" to 0.7, "outstanding" to 0.7, "delightful" to 0.6, "pleased" to 0.5,
        "magnifique" to 0.7, "super" to 0.6, "genial" to 0.7, "adore" to 0.8, "aime" to 0.6,
        "merci" to 0.4, "bien" to 0.4, "bon" to 0.4, "bonne" to 0.4, "parfait" to 0.7,
        "incroyable" to 0.7, "formidable" to 0.7, "heureux" to 0.6, "heureuse" to 0.6,
        "contente" to 0.5, "joie" to 0.6, "chouette" to 0.5, "top" to 0.5,
        "sublime" to 0.7, "fantastique" to 0.7, "bisous" to 0.5,
        "gracias" to 0.4, "bueno" to 0.4, "buena" to 0.4, "excelente" to 0.7, "maravilloso" to 0.7,
        "increible" to 0.7, "perfecto" to 0.7, "feliz" to 0.6, "amor" to 0.7,
        "amigo" to 0.4, "amiga" to 0.4, "hermoso" to 0.6, "hermosa" to 0.6, "fantastico" to 0.7,
        "danke" to 0.4, "gut" to 0.4, "toll" to 0.6, "wunderbar" to 0.7, "fantastisch" to 0.7,
        "schon" to 0.5, "liebe" to 0.7, "freude" to 0.6, "prima" to 0.5, "perfekt" to 0.7,
        "ausgezeichnet" to 0.7, "herrlich" to 0.6,
    )

    private val NEGATIVE_WORDS: Map<String, Double> = mapOf(
        "hate" to -0.8, "terrible" to -0.7, "awful" to -0.7, "horrible" to -0.7, "bad" to -0.5,
        "worst" to -0.7, "ugly" to -0.6, "stupid" to -0.6, "angry" to -0.5, "sad" to -0.5,
        "annoying" to -0.5, "boring" to -0.4, "disgusting" to -0.7, "pathetic" to -0.6,
        "useless" to -0.6, "trash" to -0.6, "no" to -0.2, "never" to -0.3, "wrong" to -0.4,
        "fail" to -0.5, "sucks" to -0.6, "disappointed" to -0.5, "frustrating" to -0.5,
        "nul" to -0.6, "nulle" to -0.6, "deteste" to -0.8, "mauvais" to -0.5,
        "mauvaise" to -0.5, "moche" to -0.5, "triste" to -0.5, "colere" to -0.5, "ennuyeux" to -0.4,
        "degoutant" to -0.7, "pourri" to -0.6, "pire" to -0.6, "honte" to -0.5, "stupide" to -0.6,
        "imbecile" to -0.7, "idiot" to -0.6, "merde" to -0.7, "chiant" to -0.5, "galere" to -0.4,
        "enervant" to -0.5, "lamentable" to -0.6,
        "malo" to -0.5, "mala" to -0.5, "odio" to -0.8,
        "feo" to -0.5, "fea" to -0.5, "estupido" to -0.6, "basura" to -0.6,
        "peor" to -0.6, "horroroso" to -0.7,
        "schlecht" to -0.5, "schrecklich" to -0.7, "furchtbar" to -0.7, "hass" to -0.8,
        "hasslich" to -0.6, "dumm" to -0.6, "langweilig" to -0.4, "ekelhaft" to -0.7,
        "traurig" to -0.5,
    )
}
