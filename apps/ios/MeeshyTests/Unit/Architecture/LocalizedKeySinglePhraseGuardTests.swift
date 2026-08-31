import XCTest

/// **Une clé de localisation porte UNE phrase.**
///
/// `String(localized:defaultValue:)` a deux moitiés qui ne sont pas gardées
/// pareil : la CLÉ adresse une entrée du catalogue, le `defaultValue` n'est
/// qu'un repli. Rien n'oblige deux sites qui écrivent la même clé à écrire le
/// même repli — et tant que la clé est absente du catalogue, rien ne le
/// RÉVÈLE : chaque site rend son propre littéral, l'écran est juste, et le
/// cliquet i18n compte UNE clé de dette pour N phrases non traduites.
///
/// Le jour où quelqu'un fait ce que le cliquet demande — entrer la clé au
/// catalogue — les N sites tombent sur la MÊME phrase. C'est une régression
/// produite par un travail de traduction correct, sur une surface que le
/// traducteur n'a pas ouverte.
///
/// ## Le cas qui a motivé ce témoin (271i)
///
/// `feed.media.item` était appelée cinq fois dans la grille média du fil, avec
/// « Media 1 of \(count) », « Media 2 of \(count) »… jusqu'à « Media 5 of
/// \(count) » : la POSITION était gravée dans le littéral au lieu de voyager
/// comme argument. L'entrer au catalogue aurait fait annoncer « Média 1 sur 7 »
/// par VoiceOver sur les cinq tuiles. La clé prend désormais sa position en
/// argument, et ce témoin interdit la forme.
///
/// ## Ce que le témoin compare, et ce qu'il ne compare pas
///
/// Il compare des PHRASES, pas des littéraux : les interpolations sont
/// remplacées par un jeton avant comparaison. Deux sites qui écrivent
/// « Supprimer \(label) » et « Supprimer \(labelForAttachment(attachment)) »
/// disent la même phrase avec deux noms de variable — ce n'est pas un défaut,
/// et un témoin qui les séparerait serait du bruit. Deux sites qui écrivent
/// « Media 1 of \(count) » et « Media 2 of \(count) » disent DEUX phrases.
///
/// ## Portée : la cible app
///
/// Le témoin lit `apps/ios/Meeshy` — la cible dont ce cycle a la charge — et
/// pas les extensions ni le SDK, pour une raison de justesse et non de
/// commodité : une extension est un BUNDLE SÉPARÉ, son catalogue est un autre
/// fichier, et deux cibles peuvent légitimement servir deux phrases sous une
/// même clé. `share.empty` en est l'exemple : « Aucune conversation » dans
/// l'app, « Ouvrez Meeshy une fois pour retrouver vos conversations ici » dans
/// la feuille de partage, chacune dans son catalogue, les deux traduites.
/// Élargir ce témoin aux autres cibles demande de le grouper par catalogue
/// résolu, pas seulement par clé.
@MainActor
final class LocalizedKeySinglePhraseGuardTests: XCTestCase {

    private static let appSourceRoot = "apps/ios/Meeshy"

    private func repoRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // …/Unit/Architecture
            .deletingLastPathComponent()  // …/Unit
            .deletingLastPathComponent()  // …/MeeshyTests
            .deletingLastPathComponent()  // …/apps/ios
            .deletingLastPathComponent()  // …/apps
            .deletingLastPathComponent()  // racine du dépôt
    }

    /// Le repli débarrassé de ses interpolations : « Média \(position) sur
    /// \(total) » et « Média \(i) sur \(n) » rendent la même phrase.
    ///
    /// Le balayage est à parenthèses ÉQUILIBRÉES plutôt qu'à première
    /// parenthèse fermante : `\(count == 1 ? f(a) : g(b))` en contient de
    /// l'intérieur, et une expression réelle du dépôt les porte
    /// (`\(communityLinks.reduce(0) { $0 + $1.memberCount })`).
    static func phrase(of defaultValue: String) -> String {
        var result = ""
        var index = defaultValue.startIndex
        while index < defaultValue.endIndex {
            let character = defaultValue[index]
            let next = defaultValue.index(after: index)
            guard character == "\\", next < defaultValue.endIndex, defaultValue[next] == "(" else {
                result.append(character)
                index = next
                continue
            }
            var depth = 0
            var cursor = next
            while cursor < defaultValue.endIndex {
                if defaultValue[cursor] == "(" { depth += 1 }
                if defaultValue[cursor] == ")" {
                    depth -= 1
                    if depth == 0 { break }
                }
                cursor = defaultValue.index(after: cursor)
            }
            result += "<arg>"
            index = cursor < defaultValue.endIndex ? defaultValue.index(after: cursor) : cursor
        }
        return result
    }

    /// Clé → phrase normalisée → fichiers qui l'écrivent.
    private func phrasesByKey(in files: [URL]) -> [String: [String: Set<String>]] {
        var result: [String: [String: Set<String>]] = [:]
        for file in files {
            guard let text = try? String(contentsOf: file, encoding: .utf8) else { continue }
            for call in LocalizedCallScanner.localizedCalls(in: text) {
                guard LocalizedCallScanner.isIdentifier(call.key),
                      !call.isModuleBundle,
                      let fallback = call.defaultValue else { continue }
                result[call.key, default: [:]][Self.phrase(of: fallback), default: []]
                    .insert(file.lastPathComponent)
            }
        }
        return result
    }

    func test_uneCléDeLaCibleAppNAQuUneSeulePhrase() throws {
        let root = repoRoot().appendingPathComponent(Self.appSourceRoot)
        let files = LocalizedCallScanner.swiftFiles(under: root)
        try XCTSkipIf(files.isEmpty, "Sources iOS inatteignables depuis \(root.path)")

        let divergent = phrasesByKey(in: files).filter { $0.value.count > 1 }

        let report = divergent
            .sorted { $0.key < $1.key }
            .map { key, phrases in
                let forms = phrases
                    .sorted { $0.key < $1.key }
                    .map { phrase, sites in "    « \(phrase) » — \(sites.sorted().joined(separator: ", "))" }
                    .joined(separator: "\n")
                return "  \(key)\n\(forms)"
            }
            .joined(separator: "\n")

        XCTAssertTrue(
            divergent.isEmpty,
            "\(divergent.count) clé(s) portent plusieurs phrases. Entrer une telle clé au "
            + "catalogue ferait tomber tous ses sites sur UNE seule d'entre elles : ce qui "
            + "distingue les sites doit voyager en ARGUMENT, ou chaque phrase doit avoir sa "
            + "propre clé.\n\(report)"
        )
    }

    /// **Un témoin qui n'a jamais rougi est une hypothèse.** Sans chaîne Apple
    /// pour l'exécuter ailleurs, la forme qu'il interdit et la forme qu'il
    /// tolère sont vérifiées ici, sur des sources synthétiques.
    func test_leTémoinSépareDeuxPhrasesEtTolèreDeuxNomsDeVariable() throws {
        let source = #"""
        let a = String(localized: "gallery.item", defaultValue: "Media 1 of \(count)")
        let b = String(localized: "gallery.item", defaultValue: "Media 2 of \(count)")
        let c = String(localized: "row.delete", defaultValue: "Supprimer \(label)")
        let d = String(localized: "row.delete", defaultValue: "Supprimer \(labelFor(item))")
        """#

        var phrases: [String: Set<String>] = [:]
        for call in LocalizedCallScanner.localizedCalls(in: source) {
            guard let fallback = call.defaultValue else { continue }
            phrases[call.key, default: []].insert(Self.phrase(of: fallback))
        }

        let gallery = try XCTUnwrap(phrases["gallery.item"], "la clé synthétique n'a pas été vue")
        XCTAssertEqual(gallery.count, 2,
                       "Deux positions gravées dans le littéral sont DEUX phrases : \(gallery)")

        let delete = try XCTUnwrap(phrases["row.delete"], "la clé synthétique n'a pas été vue")
        XCTAssertEqual(delete, ["Supprimer <arg>"],
                       "Deux noms de variable pour la même phrase n'en font pas deux : \(delete)")
    }
}
