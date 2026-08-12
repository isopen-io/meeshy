package me.meeshy.sdk.lang

import me.meeshy.sdk.model.LanguageData

/**
 * On-device detection of the language a message was composed in, used to stamp
 * `originalLanguage` at send time (Prisme Linguistique).
 *
 * Faithful port of the pure heuristic in apps/web/utils/language-detection.ts:
 *  - `detectLanguage` — script + stopword regex scoring per language.
 *  - `detectComposeLanguage` — the compose-time guards around it: strip URLs,
 *    require a minimum of real letters, and fall back to the caller's language
 *    (the sender's resolved content language) when the signal is too weak.
 *
 * iOS uses Apple's `NLLanguageRecognizer` and web uses `tinyld`; neither is a
 * pure, JVM-testable dependency, so Android ports the shared hand-rolled
 * heuristic (the documented "fallback basique" in the web source). The result
 * is always either a code present in [LanguageData] or the supplied fallback —
 * never an unsupported or empty code.
 */
object ComposeLanguageDetector {

    /** Below this many Unicode letters the text is too short to trust. */
    private const val MIN_ALPHA: Int = 4

    private val URL: Regex = Regex("""https?://\S+""")
    private val LETTER: Regex = Regex("""\p{L}""")

    private data class LanguagePatterns(val code: String, val patterns: List<Regex>)

    /**
     * Ordered so that, on a score tie, the earliest-declared language wins —
     * matching the web source's insertion-ordered `Object.entries` iteration.
     * Codes and regexes are a verbatim port of the web `patterns` table.
     */
    private val PATTERNS: List<LanguagePatterns> = listOf(
        LanguagePatterns(
            "fr",
            listOf(
                Regex("""\b(le|la|les|de|du|des|un|une|et|est|avec|pour|par|dans|sur|son|sa|ses|que|qui|où|quand|comment|pourquoi)\b"""),
                Regex("""[àâäéèêëïîôöùûüÿç]"""),
            ),
        ),
        LanguagePatterns(
            "es",
            listOf(
                Regex("""\b(el|la|los|las|de|del|un|una|y|es|con|para|por|en|sobre|su|sus|que|quien|donde|cuando|como|porque)\b"""),
                Regex("""[áéíóúüñ]"""),
            ),
        ),
        LanguagePatterns(
            "de",
            listOf(
                Regex("""\b(der|die|das|den|dem|ein|eine|und|ist|mit|für|von|in|auf|sein|seine|ihre|dass|wer|wo|wann|wie|warum)\b"""),
                Regex("""[äöüß]"""),
            ),
        ),
        LanguagePatterns(
            "it",
            listOf(
                Regex("""\b(il|la|lo|gli|le|di|del|un|una|e|è|con|per|da|in|su|suo|sua|che|chi|dove|quando|come|perché)\b"""),
                Regex("""[àèéìíîòóù]"""),
            ),
        ),
        LanguagePatterns(
            "pt",
            listOf(
                Regex("""\b(o|a|os|as|de|do|da|um|uma|e|é|com|para|por|em|sobre|seu|sua|que|quem|onde|quando|como|porque)\b"""),
                Regex("""[àáâãéêíóôõú]"""),
            ),
        ),
        LanguagePatterns(
            "ru",
            listOf(
                Regex("""[а-яё]"""),
                Regex("""\b(и|в|на|с|по|к|из|от|за|для|про|под|над|при|без|через|между|среди|около|вокруг|внутри)\b"""),
            ),
        ),
        LanguagePatterns(
            "ar",
            listOf(
                Regex("""[ا-ي]"""),
                Regex("""\b(في|من|إلى|على|عن|مع|بعد|قبل|عند|لدى|حول|خلال|بين|ضد|نحو|تحت|فوق|أمام|خلف|يمين|شمال)\b"""),
            ),
        ),
        LanguagePatterns(
            "zh",
            listOf(
                Regex("""[一-鿿]"""),
                Regex("""\b(的|了|在|是|我|有|和|人|这|中|大|为|上|个|国|年|到|说|们|就|出|要|以|时|地|得|可|下|对|生|也|子|后|自|回|她|哪|并|那|意|发|样|等|法|应|加|好)\b"""),
            ),
        ),
        LanguagePatterns(
            "ja",
            listOf(
                Regex("""[぀-ゟ゠-ヿ一-龯]"""),
                Regex("""\b(は|が|を|に|で|と|から|まで|より|へ|の|だ|である|です|ます|した|する|される|なる|ある|いる|この|その|あの|どの)\b"""),
            ),
        ),
        LanguagePatterns(
            "ko",
            listOf(
                Regex("""[가-힯]"""),
                Regex("""\b(은|는|이|가|을|를|에|에서|으로|로|와|과|의|도|만|조차|까지|부터|보다|처럼|같이|위해|대해|통해|따라|관해|대한|위한)\b"""),
            ),
        ),
    )

    /**
     * Detect the language of [text]; return the caller-supplied [fallback] when
     * the text is too short or carries no recognizable signal.
     *
     * The returned code is guaranteed to be either a language in [LanguageData]
     * or [fallback] verbatim (the caller passes an already-resolved code).
     */
    fun detect(text: String, fallback: String): String {
        val cleaned = URL.replace(text, " ")
        if (LETTER.findAll(cleaned).count() < MIN_ALPHA) return fallback

        val lower = cleaned.lowercase()
        var best: String? = null
        var bestScore = 0
        for (entry in PATTERNS) {
            val score = entry.patterns.sumOf { it.findAll(lower).count() }
            if (score > bestScore) {
                bestScore = score
                best = entry.code
            }
        }

        val detected = best ?: return fallback
        return if (LanguageData.info(detected) != null) detected else fallback
    }
}
