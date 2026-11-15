import XCTest

/// **Une puce de langue se dessine à UN endroit.**
///
/// Le dépôt en portait **huit** copies du même `VStack(spacing: 1) {
/// Text(drapeau) ; RoundedRectangle(cornerRadius: 1).frame(width: 10,
/// height: 1.5) }` — bulle de message, fil, détail d'une publication, son
/// repartage, commentaires (×2), commentaire de story (×2), reels. Aucune
/// n'était complètement fausse ; **chacune n'avait raison que sur un tiers du
/// contrôle** — le contrôle natif, la cible tactile, ou l'état énoncé.
///
/// C'est le mode d'échec le plus tenace du dépôt : une surface qui figure déjà
/// dans la colonne des sites conformes ne se rouvre pas. Deux des huit copies
/// DÉCLARAIENT même leur cible de 44 pt — `.meeshyTapTarget(44)` posé APRÈS le
/// `.onTapGesture` qu'il doit agrandir, c'est-à-dire du bon côté de la revue et
/// du mauvais côté de l'idiome SwiftUI, qui écrit `contentShape` AVANT le geste.
///
/// La garde ferme la forme, pas l'inventaire :
///
/// 1. **Aucun soulignement de drapeau** hors de la source unique — c'est la
///    signature graphique de la puce, celle qu'une neuvième copie recopierait.
/// 2. **Les clés `a11y.language.*` ne se citent que depuis la source unique.**
///    Une surface qui les rappelle en direct est une table jumelle en germe.
/// 3. **Aucune paire `onTapGesture` + `meeshyTapTarget`** nulle part dans
///    l'app : c'est l'ordre inerte, et il ne doit pas revenir par une autre
///    surface que celles soldées ici.
final class LanguageFlagChipSourceGuardTests: XCTestCase {

    private var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Guards
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent("Meeshy")
    }

    private static let sourceOfTruth = "LanguageFlagChip.swift"

    /// La signature graphique de la puce : un rectangle de rayon 1 dont la
    /// hauteur vaut 1,5 pt. Les huit copies l'écrivaient toutes, à la largeur
    /// près (10 pt, sauf le repartage qui disait 8 sans raison).
    private static let underlinePattern = "RoundedRectangle(cornerRadius: 1)"
    private static let underlineHeight = "height: 1.5"

    private static let reservedKeys = ["a11y.language.show", "a11y.language.shown"]

    // MARK: - Règle 1 — aucune deuxième puce

    func test_leSoulignementDeLangueNeSeDessineQueDansLaSourceUnique() throws {
        var violations: [String] = []
        for file in swiftFiles(under: appRoot) where file.lastPathComponent != Self.sourceOfTruth {
            let text = (try? String(contentsOf: file, encoding: .utf8)) ?? ""
            for (index, line) in codeLines(of: text) where Self.matchesUnderline(line, in: text) {
                violations.append("\(file.lastPathComponent):\(index + 1)  \(line.trimmingCharacters(in: .whitespaces))")
            }
        }
        XCTAssertTrue(
            violations.isEmpty,
            "Soulignement de puce de langue dessiné hors de `LanguageFlagChip` — c'est "
            + "une neuvième table, avec sa propre cible et sa propre annonce d'état :\n"
            + violations.sorted().joined(separator: "\n")
        )
    }

    // MARK: - Règle 2 — un seul citant des clés

    func test_lesClesDeLangueNeSeCitentQueDepuisLaSourceUnique() throws {
        var violations: [String] = []
        for file in swiftFiles(under: appRoot) where file.lastPathComponent != Self.sourceOfTruth {
            let text = (try? String(contentsOf: file, encoding: .utf8)) ?? ""
            for (index, line) in codeLines(of: text) {
                for key in Self.reservedKeys where line.contains("\"\(key)\"") {
                    violations.append("\(file.lastPathComponent):\(index + 1)  \(key)")
                }
            }
        }
        XCTAssertTrue(
            violations.isEmpty,
            "Clés `a11y.language.*` citées hors de `LanguageFlagChip` :\n"
            + violations.sorted().joined(separator: "\n")
        )
    }

    // MARK: - Règle 3 — l'ordre inerte ne revient pas

    /// `.meeshyTapTarget()` agrandit la vue à laquelle il s'applique. Posé APRÈS
    /// un `.onTapGesture`, il agrandit une vue qui n'est plus celle qui porte le
    /// geste : la cible reste celle du contenu, et la revue voit un 44 qui n'est
    /// jamais servi. La forme juste est un `Button` dont le label porte son
    /// cadre et son `contentShape`.
    func test_aucuneCibleTactileNEstPoseeApresLeGesteQuElleDoitAgrandir() throws {
        var violations: [String] = []
        for file in swiftFiles(under: appRoot) {
            let text = (try? String(contentsOf: file, encoding: .utf8)) ?? ""
            let lines = text.components(separatedBy: .newlines)
            for (index, line) in lines.enumerated() where line.contains(".onTapGesture") {
                let window = lines[index..<min(index + 14, lines.count)].joined(separator: "\n")
                guard window.contains(".meeshyTapTarget(") else { continue }
                violations.append("\(file.lastPathComponent):\(index + 1)")
            }
        }
        XCTAssertTrue(
            violations.isEmpty,
            "`.meeshyTapTarget` posé après le `.onTapGesture` qu'il prétend agrandir — "
            + "l'agrandissement s'applique à une vue qui ne porte plus le geste. Passer "
            + "par un `Button` dont le label porte le cadre et le `contentShape` :\n"
            + violations.sorted().joined(separator: "\n")
        )
    }

    // MARK: - Bornes : le scanner voit ce qu'il interdit

    /// Sans cette borne, les règles 1 et 3 seraient vertes parce qu'elles ne
    /// voient rien, et non parce que rien n'existe.
    func test_leScannerReconnaitLesFormesQuIlInterdit() {
        let underline = """
            RoundedRectangle(cornerRadius: 1)
                .fill(Color(hex: "AABBCC"))
                .frame(width: 10, height: 1.5)
            """
        let hit = codeLines(of: underline).filter { Self.matchesUnderline($0.1, in: underline) }
        XCTAssertEqual(hit.count, 1, "la règle 1 doit voir le soulignement qu'elle interdit")

        XCTAssertTrue(underline.contains(Self.underlinePattern),
                      "la signature graphique doit rester littérale et lisible")
    }

    /// Et la source unique cite bien les deux clés qu'elle réserve — sans quoi
    /// la règle 2 resterait verte si le vocabulaire disparaissait.
    func test_laSourceUniqueCiteLesDeuxClesQuElleReserve() throws {
        let url = appRoot
            .appendingPathComponent("Features/Main/Components")
            .appendingPathComponent(Self.sourceOfTruth)
        let text = try String(contentsOf: url, encoding: .utf8)
        for key in Self.reservedKeys {
            XCTAssertTrue(text.contains("\"\(key)\""), "clé \(key) absente de la source unique")
        }
    }

    // MARK: - Outillage

    /// Un soulignement compte quand la LIGNE porte sa hauteur de 1,5 pt **et**
    /// que le fichier dessine le rectangle de rayon 1 qui le caractérise — un
    /// `height: 1.5` isolé (un séparateur, une règle) n'est pas une puce.
    private static func matchesUnderline(_ line: String, in file: String) -> Bool {
        line.contains(underlineHeight) && file.contains(underlinePattern)
    }

    /// Les lignes de code, commentaires de ligne exclus : le doc-comment de la
    /// source unique DÉCRIT la forme interdite, et une garde qui lirait les
    /// commentaires se déclencherait sur sa propre explication.
    private func codeLines(of text: String) -> [(Int, String)] {
        text.components(separatedBy: .newlines).enumerated().compactMap { index, line in
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            guard !trimmed.hasPrefix("//") else { return nil }
            return (index, line)
        }
    }

    private func swiftFiles(under root: URL) -> [URL] {
        guard let enumerator = FileManager.default.enumerator(
            at: root, includingPropertiesForKeys: nil
        ) else { return [] }
        return enumerator.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }
}
