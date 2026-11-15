package me.meeshy.sdk.model.translation

import java.util.regex.Matcher
import java.util.regex.Pattern

/**
 * Ce qu'une traduction ne réécrit jamais (#14333) — miroir Kotlin de
 * `services/translator/src/utils/text_segmentation.py` (#14327) et de
 * `TranslationProtectedEntities.swift` (MeeshySDK). Le nom de l'auteur d'une phrase de partage,
 * les adresses, e-mails, @mentions, #hashtags, pseudos nus et émojis deviennent des marqueurs
 * `🔹EMOJI_n🔹` que le moteur sur l'appareil ne lit pas, puis reprennent leur place.
 *
 * Les classes de caractères sont écrites en propriétés Unicode (`\p{L}`…) et non en `\w` : le
 * `\w` de la JVM (tests) est ASCII, celui d'Android (ICU) Unicode.
 */
public object TranslationProtectedEntities {

    public data class Masked(val text: String, val entities: Map<Int, String>)

    public fun protect(text: String): Masked {
        val existing = PLACEHOLDER.matcher(text).let { m -> generateSequence { if (m.find()) m.group(1).toInt() else null }.toList() }
        val masker = Masker((existing.maxOrNull() ?: -1) + 1)
        val shielded = masker.maskShareAuthor(text)
        return Masked(masker.maskEntities(shielded), masker.entities.toMap())
    }

    public fun restore(text: String, entities: Map<Int, String>): String =
        entities.toSortedMap().entries.fold(text) { result, (index, value) ->
            Pattern.compile("🔹\\s*EMOJI_\\s*$index\\s*🔹").matcher(result).replaceAll(Matcher.quoteReplacement(value))
        }

    /** La sortie du moteur porte chaque marqueur de l'entrée, une fois, intact. */
    public fun placeholdersKept(masked: String, translated: String): Boolean =
        markerCounts(PLACEHOLDER, masked) == markerCounts(LOOSE_PLACEHOLDER, translated)

    /** Le texte masqué en morceaux alternés : texte libre, marqueur, texte libre… */
    public fun splitOnPlaceholders(masked: String): List<String> {
        val parts = mutableListOf<String>()
        val matcher = PLACEHOLDER.matcher(masked)
        var cursor = 0
        while (matcher.find()) {
            parts += masked.substring(cursor, matcher.start())
            parts += matcher.group()
            cursor = matcher.end()
        }
        parts += masked.substring(cursor)
        return parts.filter { it.isNotEmpty() }
    }

    public fun isPlaceholder(part: String): Boolean = PLACEHOLDER.matcher(part).matches()

    /** Un texte masqué qui ne contient plus aucune lettre n'a rien à traduire. */
    public fun hasTranslatableText(masked: String): Boolean =
        PLACEHOLDER.matcher(masked).replaceAll("").any { it.isLetter() }

    private const val MARKER = "🔹EMOJI_\\p{Nd}+🔹"
    private const val W = "[\\p{L}\\p{M}\\p{N}_]"
    private const val LETTER = "\\p{L}"

    private const val EMOJI_UNIT = "(?:[\\x{1F3FB}-\\x{1F3FF}]|\\x{200D}|\\x{FE0F}|\\x{FE0E}" +
        "|[\\x{1F600}-\\x{1F64F}]|[\\x{1F300}-\\x{1F5FF}]|[\\x{1F680}-\\x{1F6FF}]" +
        "|[\\x{1F700}-\\x{1F77F}]|[\\x{1F780}-\\x{1F7FF}]|[\\x{1F800}-\\x{1F8FF}]" +
        "|[\\x{1F900}-\\x{1F9FF}]|[\\x{1FA00}-\\x{1FA6F}]|[\\x{1FA70}-\\x{1FAFF}]" +
        "|[\\x{2702}-\\x{27B0}]|[\\x{1F100}-\\x{1F251}]|[\\x{1F1E0}-\\x{1F1FF}]" +
        "|[\\x{2600}-\\x{26FF}]|[\\x{2700}-\\x{27BF}]|\\x{2B50}|[\\x{2934}-\\x{2935}]" +
        "|\\x{3030}|\\x{303D}|\\x{3297}|\\x{3299}|[#*0-9]\\x{FE0F}?\\x{20E3}" +
        "|[\\x{00A9}\\x{00AE}\\x{203C}\\x{2049}\\x{2122}\\x{2139}]|[\\x{2194}-\\x{2199}\\x{21A9}-\\x{21AA}]" +
        "|[\\x{231A}-\\x{231B}\\x{2328}\\x{23CF}\\x{23E9}-\\x{23F3}\\x{23F8}-\\x{23FA}\\x{24C2}]" +
        "|[\\x{25AA}-\\x{25AB}\\x{25B6}\\x{25C0}\\x{25FB}-\\x{25FE}]" +
        "|[\\x{2B05}-\\x{2B07}\\x{2B1B}-\\x{2B1C}\\x{2B55}])"

    // L'ordre des branches compte : à une même position, la forme la plus longue gagne.
    private val ENTITY: Pattern = Pattern.compile(
        "(?<placeholder>$MARKER)" +
            "|(?<rawblock>\\[\\[[^\\[\\]\\n]+\\]\\])" +
            "|\\[(?<mdlabel>[^\\[\\]\\n]+)\\](?<mdtarget>\\([^()\\s]+\\))" +
            "|(?<angle><(?:https?://|www\\.)[^\\s<>]+>)" +
            "|(?<url>(?:https?://|(?<![\\p{L}\\p{M}\\p{N}_/.@])www\\.)[^\\s<>]*[^\\s<>.,;:!?'\"»)\\]])" +
            "|(?<shortlink>(?<![\\p{L}\\p{M}\\p{N}_+])m\\+[A-Za-z0-9_-]{2,50})" +
            "|(?<email>(?<![\\p{L}\\p{M}\\p{N}_.+-])[\\p{L}\\p{M}\\p{N}_.+-]+@[\\p{L}\\p{M}\\p{N}_-]+(?:\\.[\\p{L}\\p{M}\\p{N}_-]+)+)" +
            "|(?<mention>(?<![\\p{L}\\p{M}\\p{N}_@])@[\\p{L}\\p{M}\\p{N}_-]{1,30})" +
            "|(?<hashtag>(?<![\\p{L}\\p{M}\\p{N}_#&])#$W+)" +
            "|(?<handle>(?<![\\p{L}\\p{M}\\p{N}_@#&])(?=$W*$LETTER)(?:$W*_$W*|$LETTER+\\p{Nd}$W*)(?!$W))" +
            "|(?<emoji>(?:(?!$MARKER)$EMOJI_UNIT)+)",
    )

    // « 🔗 <Story|Réel|Publication…> [de|by|von|di] <auteur> : <lien> » : l'auteur est masqué par
    // sa POSITION, le genre du contenu restant à traduire.
    private const val SHARE_KINDS = "story|stories|reel|réel|post|publication|publicación|publicação|beitrag|" +
        "historia|história|storia|قصة|مقطع|منشور"

    private val SHARE_PHRASE: Pattern = Pattern.compile(
        "^\\s*🔗\\s*(?:$SHARE_KINDS)\\s+(?:(?:de|by|von|di|da|do|of)\\s+)?" +
            "(?<author>[^\\s:][^\\n:]*?)\\s*:\\s*(?:https?://|www\\.)\\S+\\s*$",
        Pattern.CASE_INSENSITIVE or Pattern.UNICODE_CASE,
    )

    private val PLACEHOLDER: Pattern = Pattern.compile("🔹EMOJI_(\\p{Nd}+)🔹")
    private val LOOSE_PLACEHOLDER: Pattern = Pattern.compile("🔹\\s*EMOJI_\\s*(\\p{Nd}+)\\s*🔹")

    private fun markerCounts(pattern: Pattern, text: String): Map<String, Int> {
        val matcher = pattern.matcher(text)
        return generateSequence { if (matcher.find()) matcher.group(1) else null }.groupingBy { it }.eachCount()
    }

    private class Masker(private var next: Int) {
        val entities = mutableMapOf<Int, String>()

        fun mask(value: String): String {
            val index = next++
            entities[index] = value
            return "🔹EMOJI_${index}🔹"
        }

        fun maskShareAuthor(text: String): String {
            val share = SHARE_PHRASE.matcher(text)
            if (!share.matches()) return text
            return text.substring(0, share.start("author")) + mask(share.group("author")) + text.substring(share.end("author"))
        }

        fun maskEntities(text: String): String {
            val output = StringBuilder()
            val matcher = ENTITY.matcher(text)
            var cursor = 0
            while (matcher.find()) {
                output.append(text, cursor, matcher.start()).append(replacement(matcher))
                cursor = matcher.end()
            }
            return output.append(text, cursor, text.length).toString()
        }

        private fun replacement(matcher: Matcher): String = when {
            matcher.group("placeholder") != null -> matcher.group()
            matcher.group("mdtarget") != null -> "[${maskEntities(matcher.group("mdlabel"))}]${mask(matcher.group("mdtarget"))}"
            else -> mask(matcher.group())
        }
    }
}
