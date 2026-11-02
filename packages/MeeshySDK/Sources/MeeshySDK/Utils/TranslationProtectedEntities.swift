import Foundation

// MARK: - Ce qu'une traduction ne réécrit jamais (#14333)
//
// Miroir Swift de `services/translator/src/utils/text_segmentation.py`
// (`protect_entities`, `restore_entities`, `placeholders_kept`,
// `split_on_placeholders`, `is_placeholder`, `has_translatable_text`, #14327).
// Le serveur masque avant NLLB ; en conversation chiffrée de bout en bout, la
// traduction se fait SUR L'APPAREIL et passe par cette règle avant le moteur :
// le nom de l'auteur d'une phrase de partage, les adresses, e-mails, @mentions,
// #hashtags, pseudos nus et émojis deviennent des marqueurs `🔹EMOJI_n🔹` que le
// moteur ne lit pas, puis reprennent leur place. Une sortie qui perd ou altère un
// marqueur ne se sert jamais. Les deux sites gardent les mêmes cas témoins
// (`test_protected_identities.py` ↔ `TranslationProtectedEntitiesTests`).

public enum TranslationProtectedEntities {

    public struct Masked: Equatable, Sendable {
        public let text: String
        public let entities: [Int: String]
    }

    public static func protect(_ text: String) -> Masked {
        let existing = matches(of: placeholder, in: text).compactMap { Int(capture(1, of: $0, in: text) ?? "") }
        var masker = Masker(next: (existing.max() ?? -1) + 1)
        let shielded = masker.maskShareAuthor(in: text)
        return Masked(text: masker.maskEntities(in: shielded), entities: masker.entities)
    }

    public static func restore(_ text: String, entities: [Int: String]) -> String {
        entities.sorted { $0.key < $1.key }.reduce(text) { result, entry in
            let marker = regex("🔹\\s*EMOJI_\\s*\(entry.key)\\s*🔹")
            let range = NSRange(result.startIndex..., in: result)
            return marker.stringByReplacingMatches(
                in: result, range: range, withTemplate: NSRegularExpression.escapedTemplate(for: entry.value)
            )
        }
    }

    /// La sortie du moteur porte chaque marqueur de l'entrée, une fois, intact.
    public static func placeholdersKept(masked: String, translated: String) -> Bool {
        markerCounts(placeholder, in: masked) == markerCounts(loosePlaceholder, in: translated)
    }

    /// Le texte masqué en morceaux alternés : texte libre, marqueur, texte libre…
    public static func splitOnPlaceholders(_ masked: String) -> [String] {
        var parts: [String] = []
        var cursor = masked.startIndex
        for match in matches(of: placeholder, in: masked) {
            guard let range = Range(match.range, in: masked) else { continue }
            parts.append(String(masked[cursor..<range.lowerBound]))
            parts.append(String(masked[range]))
            cursor = range.upperBound
        }
        parts.append(String(masked[cursor...]))
        return parts.filter { !$0.isEmpty }
    }

    public static func isPlaceholder(_ part: String) -> Bool {
        guard let match = placeholder.firstMatch(in: part, range: NSRange(part.startIndex..., in: part)) else {
            return false
        }
        return match.range == NSRange(part.startIndex..., in: part)
    }

    /// Un texte masqué qui ne contient plus aucune lettre n'a rien à traduire.
    public static func hasTranslatableText(_ masked: String) -> Bool {
        let range = NSRange(masked.startIndex..., in: masked)
        return placeholder.stringByReplacingMatches(in: masked, range: range, withTemplate: "")
            .contains { $0.isLetter }
    }

    // MARK: - Les motifs

    private static let marker = "🔹EMOJI_\\d+🔹"

    private static let emojiUnit = """
        (?:[\\x{1F3FB}-\\x{1F3FF}]|\\x{200D}|\\x{FE0F}|\\x{FE0E}\
        |[\\x{1F600}-\\x{1F64F}]|[\\x{1F300}-\\x{1F5FF}]|[\\x{1F680}-\\x{1F6FF}]\
        |[\\x{1F700}-\\x{1F77F}]|[\\x{1F780}-\\x{1F7FF}]|[\\x{1F800}-\\x{1F8FF}]\
        |[\\x{1F900}-\\x{1F9FF}]|[\\x{1FA00}-\\x{1FA6F}]|[\\x{1FA70}-\\x{1FAFF}]\
        |[\\x{2702}-\\x{27B0}]|[\\x{1F100}-\\x{1F251}]|[\\x{1F1E0}-\\x{1F1FF}]\
        |[\\x{2600}-\\x{26FF}]|[\\x{2700}-\\x{27BF}]|\\x{2B50}|[\\x{2934}-\\x{2935}]\
        |\\x{3030}|\\x{303D}|\\x{3297}|\\x{3299}|[#*0-9]\\x{FE0F}?\\x{20E3}\
        |[\\x{00A9}\\x{00AE}\\x{203C}\\x{2049}\\x{2122}\\x{2139}]|[\\x{2194}-\\x{2199}\\x{21A9}-\\x{21AA}]\
        |[\\x{231A}-\\x{231B}\\x{2328}\\x{23CF}\\x{23E9}-\\x{23F3}\\x{23F8}-\\x{23FA}\\x{24C2}]\
        |[\\x{25AA}-\\x{25AB}\\x{25B6}\\x{25C0}\\x{25FB}-\\x{25FE}]\
        |[\\x{2B05}-\\x{2B07}\\x{2B1B}-\\x{2B1C}\\x{2B55}])
        """

    // L'ordre des branches compte : à une même position, la forme la plus longue
    // gagne (voir le commentaire de `PROTECTED_ENTITY_PATTERN` côté translator).
    private static let entity = regex(
        "(?<placeholder>\(marker))"
            + "|(?<rawblock>\\[\\[[^\\[\\]\\n]+\\]\\])"
            + "|\\[(?<mdlabel>[^\\[\\]\\n]+)\\](?<mdtarget>\\([^()\\s]+\\))"
            + "|(?<angle><(?:https?://|www\\.)[^\\s<>]+>)"
            + "|(?<url>(?:https?://|(?<![\\w/.@])www\\.)[^\\s<>]*[^\\s<>.,;:!?'\"»)\\]])"
            + "|(?<shortlink>(?<![\\w+])m\\+[A-Za-z0-9_-]{2,50})"
            + "|(?<email>(?<![\\w.+-])[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+)"
            + "|(?<mention>(?<![\\w@])@[\\w-]{1,30})"
            + "|(?<hashtag>(?<![\\w#&])#\\w+)"
            + "|(?<handle>(?<![\\w@#&])(?=\\w*[^\\W\\d_])(?:\\w*_\\w*|[^\\W\\d_]+\\d\\w*)(?!\\w))"
            + "|(?<emoji>(?:(?!\(marker))\(emojiUnit))+)"
    )

    // La phrase qu'iOS et Android composent au partage d'un contenu :
    // « 🔗 <Story|Réel|Publication…> [de|by|von|di] <auteur> : <lien> ». Le nom
    // de l'auteur est masqué par sa POSITION, le genre restant à traduire.
    private static let shareKinds = "story|stories|reel|réel|post|publication|publicación|publicação|beitrag|"
        + "historia|história|storia|قصة|مقطع|منشور"

    private static let sharePhrase = regex(
        "^\\s*🔗\\s*(?:\(shareKinds))\\s+(?:(?:de|by|von|di|da|do|of)\\s+)?"
            + "(?<author>[^\\s:][^\\n:]*?)\\s*:\\s*(?:https?://|www\\.)\\S+\\s*$",
        options: [.caseInsensitive]
    )

    private static let placeholder = regex("🔹EMOJI_(\\d+)🔹")
    private static let loosePlaceholder = regex("🔹\\s*EMOJI_\\s*(\\d+)\\s*🔹")

    // MARK: - Le masquage

    private struct Masker {
        var next: Int
        var entities: [Int: String] = [:]

        mutating func mask(_ value: String) -> String {
            let index = next
            entities[index] = value
            next += 1
            return "🔹EMOJI_\(index)🔹"
        }

        mutating func maskShareAuthor(in text: String) -> String {
            guard let share = sharePhrase.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
                  let author = Range(share.range(withName: "author"), in: text) else { return text }
            return text.replacingCharacters(in: author, with: mask(String(text[author])))
        }

        mutating func maskEntities(in text: String) -> String {
            var output = ""
            var cursor = text.startIndex
            for match in matches(of: entity, in: text) {
                guard let whole = Range(match.range, in: text) else { continue }
                output += text[cursor..<whole.lowerBound]
                output += replacement(for: match, whole: whole, in: text)
                cursor = whole.upperBound
            }
            return output + text[cursor...]
        }

        private mutating func replacement(for match: NSTextCheckingResult, whole: Range<String.Index>, in text: String) -> String {
            if match.range(withName: "placeholder").location != NSNotFound { return String(text[whole]) }
            if let target = Range(match.range(withName: "mdtarget"), in: text),
               let label = Range(match.range(withName: "mdlabel"), in: text) {
                let maskedLabel = maskEntities(in: String(text[label]))
                return "[\(maskedLabel)]\(mask(String(text[target])))"
            }
            return mask(String(text[whole]))
        }
    }

    // MARK: - Outils

    private static func regex(_ pattern: String, options: NSRegularExpression.Options = []) -> NSRegularExpression {
        (try? NSRegularExpression(pattern: pattern, options: options)) ?? LiteralRegex.unmatchable
    }

    private static func matches(of regex: NSRegularExpression, in text: String) -> [NSTextCheckingResult] {
        regex.matches(in: text, range: NSRange(text.startIndex..., in: text))
    }

    private static func capture(_ group: Int, of match: NSTextCheckingResult, in text: String) -> String? {
        Range(match.range(at: group), in: text).map { String(text[$0]) }
    }

    private static func markerCounts(_ regex: NSRegularExpression, in text: String) -> [String: Int] {
        matches(of: regex, in: text)
            .compactMap { capture(1, of: $0, in: text) }
            .reduce(into: [:]) { counts, index in counts[index, default: 0] += 1 }
    }
}
