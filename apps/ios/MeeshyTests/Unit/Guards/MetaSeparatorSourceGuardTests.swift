import XCTest
// Cette garde LIT des sources et interroge le glyphe du composant — elle fait
// donc les deux, et l'import suit (leçon 250i : copier le squelette d'une garde,
// c'est hériter de ses imports, donc de son périmètre).
@testable import Meeshy

/// **Le point qui sépare ne s'écrit plus qu'à un endroit — et il naît muet.**
///
/// Le point médian d'une rangée méta est une ponctuation VISUELLE. À VoiceOver
/// il s'annonce, et le lecteur entend « point » entre chaque information des
/// surfaces les plus denses du produit.
///
/// Le dépôt connaissait la règle : **huit** sites posaient déjà
/// `.accessibilityHidden(true)`, dont un sous le commentaire « decorative
/// separator — not announced to VoiceOver ». **Vingt ne la posaient pas.** Le
/// savoir était écrit, exact, et n'avait voyagé que vers huit sites sur
/// vingt-huit.
///
/// > **Une règle qu'on peut oublier de poser doit devenir une chose qu'on ne
/// > peut pas écrire autrement.** Ajouter le modificateur vingt fois aurait
/// > soldé les vingt sites du jour et rien du vingt-neuvième. Un composant muet
/// > par construction, plus cette garde, ferme la forme.
final class MetaSeparatorSourceGuardTests: XCTestCase {

    private var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Guards
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent("Meeshy")
    }

    private static let sourceOfTruth = "MetaSeparator.swift"

    /// Les DEUX graphies du même jeton : littérale et échappée. Une garde qui ne
    /// lirait que la première serait verte sur trois des vingt-huit sites
    /// soldés ici, qui écrivaient `\u{00B7}` — c'est la leçon 248i (un scanner
    /// qui ne dé-échappe pas est vert faute de voir).
    private static let forbiddenTokens = [#"Text("·")"#, #"Text("\u{00B7}")"#]

    func test_lePointSeparateurNeSEcritQueDansSaSourceUnique() throws {
        var violations: [String] = []
        for file in swiftFiles(under: appRoot) where file.lastPathComponent != Self.sourceOfTruth {
            let text = (try? String(contentsOf: file, encoding: .utf8)) ?? ""
            for (index, line) in text.components(separatedBy: .newlines).enumerated() {
                guard !line.trimmingCharacters(in: .whitespaces).hasPrefix("//") else { continue }
                for token in Self.forbiddenTokens where line.contains(token) {
                    violations.append("\(file.lastPathComponent):\(index + 1)  \(token)")
                }
            }
        }
        XCTAssertTrue(
            violations.isEmpty,
            "Un point séparateur écrit à la main : VoiceOver l'annoncera entre deux "
            + "informations, sauf à ce que quelqu'un pense à `.accessibilityHidden(true)`. "
            + "Passer par `MetaSeparator`, muet par construction :\n"
            + violations.sorted().joined(separator: "\n")
        )
    }

    /// Le scanner reconnaît les deux graphies qu'il interdit — sans quoi il
    /// serait vert parce qu'il ne voit rien, et non parce que rien n'existe.
    func test_leScannerReconnaitLesDeuxGraphiesQuIlInterdit() {
        let literalForm = #"    Text("·").font(.caption)"#
        let escapedForm = #"    Text("\u{00B7}").font(.caption)"#
        XCTAssertTrue(Self.forbiddenTokens.contains { literalForm.contains($0) },
                      "la graphie littérale doit être vue")
        XCTAssertTrue(Self.forbiddenTokens.contains { escapedForm.contains($0) },
                      "la graphie échappée doit être vue")
        XCTAssertFalse(Self.forbiddenTokens.contains { "MetaSeparator()".contains($0) },
                       "le correctif ne doit pas être pris pour la faute")
    }

    /// Et la source unique porte bien LE glyphe qu'elle réserve — sans quoi la
    /// règle resterait verte pendant que le composant dessinerait autre chose.
    @MainActor
    func test_laSourceUniquePorteLeGlyphe() {
        XCTAssertEqual(MetaSeparator.glyph, "\u{00B7}",
                       "le composant doit dessiner le point médian que les 28 sites écrivaient")
    }

    private func swiftFiles(under root: URL) -> [URL] {
        guard let enumerator = FileManager.default.enumerator(
            at: root, includingPropertiesForKeys: nil
        ) else { return [] }
        return enumerator.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }
}
