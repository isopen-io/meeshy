import XCTest

/// **Un spécificateur de format qui ment sur le TYPE ne traduit pas mal : il
/// CRASHE** (#6073).
///
/// `String(localized: "k", defaultValue: "\(n) jours tenus…")` avec `n: Int`
/// fait générer à Swift un `%lld` ; si la traduction du catalogue porte `%@`,
/// le formateur lit l'entier 64 bits comme un POINTEUR d'objet et le
/// déréférence — `SIGSEGV`, pas un texte approximatif.
///
/// C'est exactement ce qui est arrivé à `streak.reminder.body` et à
/// `reveal.badge.tier` : introduites au #6039 avec `%@` dans les sept langues,
/// elles ont fait crasher `StreakReminderPlanTests` — six tests, six
/// redémarrages du processus — et auraient fait crasher l'APP de tout
/// utilisateur tenant une série, au moment précis où elle planifie ses rappels.
///
/// **Ce que ce témoin mesure, et ce qu'il ne mesure pas.** Il ne type pas le
/// Swift : il lit la DÉCLARATION du symbole interpolé dans le même fichier. Un
/// symbole qu'il ne sait pas typer est ignoré plutôt que deviné — une garde qui
/// invente un type produirait des rouges que personne ne sait lire, et on
/// finirait par la désarmer. Sa force est ailleurs : le cas qu'elle attrape est
/// précisément celui qui crashe, et il ne peut pas se cacher, car un entier
/// interpolé se déclare toujours quelque part.
final class CatalogFormatSpecifierGuardTests: XCTestCase {

    private var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy")
    }

    /// Les spécificateurs qu'un ENTIER accepte. `%@` n'en fait pas partie, et
    /// c'est tout l'objet de ce fichier.
    private static let entiersAdmis = ["%lld", "%ld", "%d", "%i", "%llu", "%lu", "%u"]

    private func sources() throws -> [URL] {
        guard let walker = FileManager.default.enumerator(at: appRoot, includingPropertiesForKeys: nil)
        else { return [] }
        return walker.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }

    private func catalogue() throws -> [String: [String: String]] {
        let url = appRoot.appendingPathComponent("Localizable.xcstrings")
        let data = try Data(contentsOf: url)
        guard let racine = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let chaines = racine["strings"] as? [String: Any]
        else { return [:] }

        var table: [String: [String: String]] = [:]
        for (cle, valeur) in chaines {
            guard let entree = valeur as? [String: Any],
                  let localisations = entree["localizations"] as? [String: Any]
            else { continue }
            var parLangue: [String: String] = [:]
            for (langue, contenu) in localisations {
                if let unite = (contenu as? [String: Any])?["stringUnit"] as? [String: Any],
                   let texte = unite["value"] as? String {
                    parLangue[langue] = texte
                }
            }
            table[cle] = parLangue
        }
        return table
    }

    /// `String(localized: "<clé>", defaultValue: "…\(symbole)…")` → (clé, symbole).
    /// Une seule interpolation suffit à établir le cas : les clés à deux
    /// arguments numériques n'existent pas encore dans ce catalogue, et le jour
    /// où elles existeront ce témoin dira qu'il ne les couvre pas plutôt que de
    /// prétendre le contraire.
    private func interpolations(dans source: String) -> [(cle: String, symbole: String)] {
        let motif = #"localized:\s*"([^"]+)"\s*,\s*\n?\s*defaultValue:\s*"([^"]*)""#
        guard let regex = try? NSRegularExpression(pattern: motif, options: [.dotMatchesLineSeparators])
        else { return [] }
        let ns = source as NSString
        return regex.matches(in: source, range: NSRange(location: 0, length: ns.length))
            .compactMap { m -> (String, String)? in
                let cle = ns.substring(with: m.range(at: 1))
                let defaut = ns.substring(with: m.range(at: 2))
                guard let ouverture = defaut.range(of: #"\("#),
                      let fermeture = defaut[ouverture.upperBound...].firstIndex(of: ")")
                else { return nil }
                let symbole = String(defaut[ouverture.upperBound..<fermeture])
                    .trimmingCharacters(in: .whitespaces)
                guard !symbole.isEmpty, !symbole.contains("(") else { return nil }
                return (cle, symbole)
            }
    }

    /// Le symbole est-il déclaré ENTIER dans ce fichier ? On cherche les trois
    /// formes qui portent un type explicite — paramètre, propriété, liaison —
    /// et rien d'autre : pas d'inférence, donc pas de faux positif.
    private func estEntier(_ symbole: String, dans source: String) -> Bool {
        let formes = [
            "\(symbole): Int", "\(symbole):Int",
            "let \(symbole): Int", "var \(symbole): Int",
        ]
        return formes.contains { source.contains($0) }
    }

    func test_uneCleQuiInterpoleUnEntier_nePorteJamaisUnSpecificateurDObjet() throws {
        let table = try catalogue()
        XCTAssertGreaterThan(table.count, 500, "catalogue introuvable — la garde ne mesurerait RIEN")

        var fautes: [String] = []
        for url in try sources() {
            guard let source = try? String(contentsOf: url, encoding: .utf8) else { continue }
            for (cle, symbole) in interpolations(dans: source) where estEntier(symbole, dans: source) {
                guard let traductions = table[cle] else { continue }
                for (langue, texte) in traductions.sorted(by: { $0.key < $1.key }) {
                    guard texte.contains("%@") else { continue }
                    let admis = Self.entiersAdmis.contains { texte.contains($0) }
                    if !admis {
                        fautes.append(
                            "  \(cle) [\(langue)] — interpole `\(symbole): Int` et la traduction "
                            + "porte %@ : le formateur déréférencerait l'entier (SIGSEGV). "
                            + "Attendu %lld. Site : \(url.lastPathComponent)"
                        )
                    }
                }
            }
        }

        XCTAssertTrue(
            fautes.isEmpty,
            "Spécificateur d'OBJET sur un argument ENTIER — l'app crashe au formatage, "
            + "elle n'affiche pas un texte faux :\n" + fautes.joined(separator: "\n")
        )
    }

    /// La garde doit reconnaître la forme qu'elle interdit, sinon elle est verte
    /// pour de mauvaises raisons — et elle l'a été le jour où les deux clés sont
    /// entrées dans le catalogue.
    func test_laGardeReconnaitLaFormeQuelleInterdit() {
        let source = """
        func corps(joursTenus: Int) -> String {
            String(localized: "k.body", defaultValue: "\\(joursTenus) jours tenus")
        }
        """
        let trouvees = interpolations(dans: source)
        XCTAssertEqual(trouvees.count, 1, "l'extraction doit voir la paire clé/interpolation")
        XCTAssertEqual(trouvees.first?.cle, "k.body")
        XCTAssertEqual(trouvees.first?.symbole, "joursTenus")
        XCTAssertTrue(estEntier("joursTenus", dans: source), "un paramètre `: Int` est un entier")
        XCTAssertFalse(estEntier("autreChose", dans: source), "un symbole non déclaré n'est pas deviné")
    }
}
