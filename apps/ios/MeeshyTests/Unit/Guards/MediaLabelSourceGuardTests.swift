import XCTest

/// **Une étiquette de média se résout à UN endroit — et le cliquet français ne
/// pouvait pas le voir.**
///
/// `FrenchDefaultValueRatchetTests` interdit qu'une clé au `defaultValue`
/// français manque au catalogue. Il n'inspecte que les appels
/// `String(localized:)` : **une chaîne française qui n'est jamais devenue une
/// clé ne franchit jamais son extracteur.** C'est par là que
/// `"🎵 Message vocal"`, `"🎬 Video"`, `"📍 Localisation"`,
/// `"Message vocal (0:12)"`, `"Position actuelle"` et `"Video"` sont restés
/// gravés dans le code, sur des surfaces visibles (carte de citation, liste des
/// messages épinglés, puces du composeur), pendant que les MÊMES textes
/// vivaient traduits en sept langues au catalogue.
///
/// Cette garde ferme les deux formes, par la FORME et non par l'inventaire :
///
/// 1. **Aucune étiquette de média gravée** dans les sources d'app — ni en
///    français, ni en anglais, ni préfixée de son emoji.
/// 2. **Aucune deuxième table** : les clés `attachment.label.*` et
///    `media.summary.*` ne se citent que depuis `MediaKindLabel.swift`. Une
///    surface qui les rappelle en direct est une table jumelle en germe — c'est
///    exactement ce qu'étaient les huit copies soldées ici.
///
/// La règle 2 s'arrête au périmètre iOS : le SDK
/// (`AttachmentKind.swift`, `NotificationModels.swift`) porte ses propres
/// copies et lit le catalogue de l'APP par `bundle: .main`. Elles sont HORS
/// PÉRIMÈTRE par règle de piste, nommées ici pour qu'on ne les croie pas
/// oubliées — et c'est parce qu'elles existent que `attachment.kind.{video,
/// audio,file}` et `media.summary.audio` sont RESTÉS au catalogue quand leurs
/// jumelles orphelines (`attachment.kind.{photo,location}`) en sortaient.
final class MediaLabelSourceGuardTests: XCTestCase {

    private var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Guards
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent("Meeshy")
    }

    /// L'unique site autorisé à citer les clés d'étiquette.
    private static let sourceOfTruth = "MediaKindLabel.swift"

    /// Textes d'étiquette de média, dans les deux langues où le dépôt les a
    /// gravés, avec et sans leur emoji. Volontairement littéral : une garde de
    /// forme se lit, et ce qu'elle interdit doit tenir sur un écran.
    private static let forbiddenLabels: [String] = [
        "📷 Photo", "🎥 Vidéo", "🎥 Video", "🎬 Vidéo", "🎬 Video",
        "🎙️ Message vocal", "🎵 Message vocal", "🎵 Audio",
        "📎 Fichier", "📎 File", "📎 Piece jointe", "📎 Pièce jointe",
        "📍 Position", "📍 Localisation", "📍 Location",
        "Message vocal", "Position actuelle", "Piece jointe", "Pièce jointe",
    ]

    /// Les identifiants réservés à la source unique.
    ///
    /// `attachment.kind.*` y figure bien qu'AUCUNE de ses clés ne soit servie
    /// par `MediaKindLabel` : c'est la famille jumelle, au contenu identique en
    /// sept locales, que deux surfaces d'app citaient à la place de
    /// `attachment.label.*`. Les trois entrées qui lui survivent au catalogue
    /// n'existent plus que pour le SDK — l'app n'a plus rien à y chercher.
    private static let reservedKeyPrefixes = [
        "attachment.label.", "attachment.kind.", "media.summary.",
    ]

    // MARK: - Règle 1 — aucune étiquette gravée

    func test_aucuneEtiquetteDeMediaNEstGraveeDansLesSources() throws {
        var violations: [String] = []
        for file in swiftFiles(under: appRoot) where file.lastPathComponent != Self.sourceOfTruth {
            let text = (try? String(contentsOf: file, encoding: .utf8)) ?? ""
            for (index, line) in text.components(separatedBy: .newlines).enumerated() {
                guard let literals = try? quotedLiterals(in: line), !literals.isEmpty else { continue }
                for literal in literals where Self.forbiddenLabels.contains(literal) {
                    violations.append("\(file.lastPathComponent):\(index + 1)  \"\(literal)\"")
                }
            }
        }
        XCTAssertTrue(
            violations.isEmpty,
            "Étiquettes de média gravées dans le code — elles s'afficheront dans cette langue "
            + "quelle que soit celle du lecteur. Passer par `MediaKindLabel` :\n"
            + violations.sorted().joined(separator: "\n")
        )
    }

    /// Le scanner reconnaît la forme qu'il interdit — sans quoi la règle 1
    /// serait verte parce qu'elle ne voit rien, pas parce que rien n'existe.
    func test_leScannerReconnaitLaFormeQuIlInterdit() throws {
        let grave = #"case .audio: return "🎵 Message vocal""#
        XCTAssertEqual(try quotedLiterals(in: grave).filter(Self.forbiddenLabels.contains),
                       ["🎵 Message vocal"])

        let localise = #"return String(localized: "media.summary.voice", defaultValue: "🎙️ Message vocal", bundle: bundle)"#
        XCTAssertEqual(try quotedLiterals(in: localise).filter(Self.forbiddenLabels.contains),
                       ["🎙️ Message vocal"],
                       "un `defaultValue` EST un littéral gravé — seul le fichier source unique a le droit d'en porter")

        // La forme ÉCHAPPÉE, celle des deux copies soldées ici : sans le
        // dé-échappement, la garde serait verte sur la régression exacte.
        let echappe = #"case .audio: return "\u{1F3B5} Message vocal""#
        XCTAssertEqual(try quotedLiterals(in: echappe).filter(Self.forbiddenLabels.contains),
                       ["🎵 Message vocal"])

        let innocent = #"Text(place.name ?? MediaKindLabel.placeLabel(nil))"#
        XCTAssertTrue(try quotedLiterals(in: innocent).filter(Self.forbiddenLabels.contains).isEmpty)
    }

    // MARK: - Règle 2 — une seule table

    func test_lesClesDEtiquetteNeSeCitentQueDepuisLaSourceUnique() throws {
        var violations: [String] = []
        for file in swiftFiles(under: appRoot) where file.lastPathComponent != Self.sourceOfTruth {
            let text = (try? String(contentsOf: file, encoding: .utf8)) ?? ""
            for (index, line) in text.components(separatedBy: .newlines).enumerated() {
                guard let literals = try? quotedLiterals(in: line) else { continue }
                for literal in literals
                where Self.reservedKeyPrefixes.contains(where: literal.hasPrefix) {
                    violations.append("\(file.lastPathComponent):\(index + 1)  \"\(literal)\"")
                }
            }
        }
        XCTAssertTrue(
            violations.isEmpty,
            "Ces clés d'étiquette sont citées hors de \(Self.sourceOfTruth) — une table jumelle "
            + "en germe. Appeler `MediaKindLabel.name(_:)` / `.summary(_:)` :\n"
            + violations.sorted().joined(separator: "\n")
        )
    }

    /// La source unique EXISTE et cite bien les clés : sans cette borne, les
    /// deux règles ci-dessus resteraient vertes si `MediaKindLabel.swift`
    /// disparaissait avec toutes ses clés.
    func test_laSourceUniqueCiteLesDixCles() throws {
        let file = appRoot
            .appendingPathComponent("Features/Main/Components")
            .appendingPathComponent(Self.sourceOfTruth)
        let text = try String(contentsOf: file, encoding: .utf8)
        for suffix in ["photo", "video", "audio", "file", "location"] {
            XCTAssertTrue(text.contains("\"attachment.label.\(suffix)\""),
                          "attachment.label.\(suffix) absente de la source unique")
        }
        for suffix in ["photo", "video", "voice", "file", "location"] {
            XCTAssertTrue(text.contains("\"media.summary.\(suffix)\""),
                          "media.summary.\(suffix) absente de la source unique")
        }
    }

    // MARK: - Outils

    /// Littéraux entre guillemets d'une ligne, chacun rendu DEUX fois : tel
    /// qu'écrit, et une fois ses échappements `\u{…}` résolus.
    ///
    /// Les deux copies soldées ici écrivaient `"\u{1F3B5} Message vocal"` — la
    /// forme échappée est ce qui les rendait invisibles à une lecture par
    /// emoji. Une garde qui ne verrait que la forme littérale serait verte sur
    /// exactement la régression qu'elle prétend interdire.
    private func quotedLiterals(in line: String) throws -> [String] {
        let regex = try NSRegularExpression(pattern: #""((?:[^"\\\n]|\\.)*)""#)
        let ns = line as NSString
        let raw = regex
            .matches(in: line, range: NSRange(location: 0, length: ns.length))
            .compactMap { $0.numberOfRanges > 1 ? ns.substring(with: $0.range(at: 1)) : nil }
        return raw + raw.map(unescapingUnicodeScalars).filter { !raw.contains($0) }
    }

    /// `"\u{1F3B5} X"` → `"🎵 X"`. Laisse la chaîne intacte si elle ne porte
    /// aucun échappement, ou si un point de code est invalide.
    private func unescapingUnicodeScalars(_ value: String) -> String {
        guard value.contains("\\u{"),
              let regex = try? NSRegularExpression(pattern: #"\\u\{([0-9A-Fa-f]{1,8})\}"#)
        else { return value }
        let ns = value as NSString
        var out = value
        for match in regex.matches(in: value, range: NSRange(location: 0, length: ns.length)).reversed() {
            guard let code = UInt32(ns.substring(with: match.range(at: 1)), radix: 16),
                  let scalar = Unicode.Scalar(code),
                  let range = Range(match.range, in: out) else { continue }
            out.replaceSubrange(range, with: String(Character(scalar)))
        }
        return out
    }

    private func swiftFiles(under root: URL) -> [URL] {
        guard let walker = FileManager.default.enumerator(
            at: root, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles]
        ) else { return [] }
        return walker.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }
}
