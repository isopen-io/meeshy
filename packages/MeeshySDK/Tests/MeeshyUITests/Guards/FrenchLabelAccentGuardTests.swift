import XCTest

/// Garde des accents des libellés français de MeeshyUI (#10606).
///
/// Recette 1.1.4 (2026-10-14) : la feuille des réglages d'un groupe s'affichait
/// « Reglages », « Qui peut ecrire », « Moderateurs », « Desactive ». Le défaut
/// vivait aux DEUX endroits qui servent un libellé français : le `defaultValue:`
/// des sources Swift (servi quand la clé manque au catalogue) et la valeur `fr`
/// de `Resources/Localizable.xcstrings` (servie sinon), qui le recopiait.
///
/// La garde balaie ces deux sources contre une liste de mots français qui
/// EXIGENT un accent, relevée par un balayage réel du dépôt. Elle ne retient
/// que des formes qui ne sont pas des mots anglais (« Reactions », « Debut »,
/// « Media », « Video », « Senegal » en sont exclus : un `defaultValue:` anglais
/// les porterait légitimement), comparées en mots entiers et sensibles à la casse.
/// S'y ajoutent les tournures où « a » doit être « à » (« mise a jour »).
final class FrenchLabelAccentGuardTests: XCTestCase {

    private static let wordsRequiringAnAccent: Set<String> = [
        "Algerie", "Arreter", "Arriere", "Banniere", "banniere", "Bibliotheque", "Bresil",
        "Communaute", "Communautes", "communaute", "communautes", "Coree",
        "Createur", "Creer", "Creez", "creer", "Creation",
        "Debloquer", "debloquer", "Deplacer", "deplacee", "Desactive", "desactivees",
        "Donnees", "donnees", "Duree", "Echantillon", "Echantillons", "echantillon", "echantillons",
        "Echec", "Etats", "Intensite", "Itineraire", "Luminosite", "Medias",
        "Moderateur", "Moderateurs", "Nettete", "Numero", "numero", "Parametres", "parametres",
        "Prenom", "Prive", "Privee", "privee", "Qualite", "Reessayer", "reessayez", "Reglages",
        "Retrograder", "Systeme", "systeme", "Telechargement", "Telecharger", "Telechargez",
        "telechargement", "Visibilite", "acceptee", "acceder", "affectes", "annulee",
        "apparaitront", "apres", "clonee", "decouvrir", "definitivement", "deja", "demarrera",
        "desormais", "disparaitra", "echoue", "ecrire", "effectuee", "envoyee", "ephemere",
        "fermee", "modele", "partagee", "recente", "recentes", "refusee", "repondre", "reponses",
        "resultat", "resultats", "reussi", "revoquera", "supprimees", "televerse", "televersee",
        "utilisee", "Verifier",
    ]

    private static let phrasesRequiringAnAccent: [String] = [
        "mise a jour", "mis a jour", "a partir de", "a tout moment", "a voix haute",
        "Verification d'age", "Bannissement leve", "Utilisateur bloque", "avez bloque",
        "membre trouve", "appel manque", "non publie", "vocal cree", "est cree",
    ]

    private static var packageRoot: URL {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<4 { url.deleteLastPathComponent() }
        return url
    }

    private static var meeshyUISources: URL {
        packageRoot.appendingPathComponent("Sources/MeeshyUI")
    }

    func test_defaultValues_ofMeeshyUISources_carryTheirFrenchAccents() throws {
        let root = Self.meeshyUISources
        let enumerator = try XCTUnwrap(
            FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil),
            "impossible d'énumérer \(root.path)"
        )
        let pattern = try NSRegularExpression(pattern: #"defaultValue:\s*"((?:[^"\\]|\\.)*)""#)
        var scanned = 0
        var offenders: [String] = []
        for case let url as URL in enumerator where url.pathExtension == "swift" {
            let source = try String(contentsOf: url, encoding: .utf8)
            let range = NSRange(source.startIndex..., in: source)
            for match in pattern.matches(in: source, range: range) {
                guard let valueRange = Range(match.range(at: 1), in: source) else { continue }
                let value = String(source[valueRange])
                scanned += 1
                let faults = Self.faults(in: Self.withoutInterpolations(value))
                guard !faults.isEmpty else { continue }
                let relative = url.path.replacingOccurrences(of: root.path + "/", with: "")
                offenders.append("\(relative) — « \(value) » : \(faults.joined(separator: ", "))")
            }
        }
        XCTAssertGreaterThan(scanned, 100, "le balayage des defaultValue: n'a rien lu — Sources/MeeshyUI a-t-il bougé ?")
        XCTAssertTrue(
            offenders.isEmpty,
            "defaultValue: français sans accents :\n" + offenders.sorted().joined(separator: "\n")
        )
    }

    func test_frenchValues_ofMeeshyUICatalog_carryTheirAccents() throws {
        let url = Self.meeshyUISources.appendingPathComponent("Resources/Localizable.xcstrings")
        let data = try Data(contentsOf: url)
        let catalog = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let strings = try XCTUnwrap(catalog["strings"] as? [String: Any])
        var scanned = 0
        var offenders: [String] = []
        for (key, entry) in strings {
            guard let entry = entry as? [String: Any],
                  let localizations = entry["localizations"] as? [String: Any],
                  let french = localizations["fr"] else { continue }
            for value in Self.values(in: french) {
                scanned += 1
                let faults = Self.faults(in: value)
                if !faults.isEmpty {
                    offenders.append("\(key) — « \(value) » : \(faults.joined(separator: ", "))")
                }
            }
        }
        XCTAssertGreaterThan(scanned, 1000, "le catalogue MeeshyUI n'a livré aucune valeur fr — a-t-il bougé ?")
        XCTAssertTrue(
            offenders.isEmpty,
            "valeurs fr du catalogue MeeshyUI sans accents :\n" + offenders.sorted().joined(separator: "\n")
        )
    }

    func test_guard_flagsAnUnaccentedLabel_andSparesItsAccentedForm() {
        XCTAssertEqual(Self.faults(in: "Qui peut ecrire"), ["ecrire"])
        XCTAssertEqual(Self.faults(in: "Communaute mise a jour"), ["Communaute", "mise a jour"])
        XCTAssertTrue(Self.faults(in: "Qui peut écrire").isEmpty)
        XCTAssertTrue(Self.faults(in: "Communauté mise à jour").isEmpty)
        XCTAssertTrue(Self.faults(in: "Reactions and Media").isEmpty)
    }

    private static func faults(in text: String) -> [String] {
        let words = text.components(separatedBy: CharacterSet.letters.inverted)
        let wordFaults = words.filter { wordsRequiringAnAccent.contains($0) }
        let phraseFaults = phrasesRequiringAnAccent.filter { containsWholePhrase($0, in: text) }
        return wordFaults + phraseFaults
    }

    private static func containsWholePhrase(_ phrase: String, in text: String) -> Bool {
        let escaped = NSRegularExpression.escapedPattern(for: phrase)
        guard let regex = try? NSRegularExpression(pattern: "(?<!\\p{L})" + escaped + "(?!\\p{L})") else {
            return false
        }
        return regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
    }

    private static func withoutInterpolations(_ literal: String) -> String {
        literal.replacingOccurrences(of: #"\\\([^)]*\)"#, with: " ", options: .regularExpression)
    }

    private static func values(in node: Any) -> [String] {
        if let dictionary = node as? [String: Any] {
            let own = (dictionary["value"] as? String).map { [$0] } ?? []
            return own + dictionary.filter { $0.key != "value" }.flatMap { values(in: $0.value) }
        }
        if let array = node as? [Any] {
            return array.flatMap { values(in: $0) }
        }
        return []
    }
}
