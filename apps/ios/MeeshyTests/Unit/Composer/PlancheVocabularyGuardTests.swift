import XCTest

/// **#4048 — la planche parle le modèle, ou elle ne décrit rien de nommable.**
///
/// Le vocabulaire est arrêté depuis le 2026-08-27 :
/// `MeeshyPublication` → `MeeshySlide` → `MeeshyScene` → `MeeshyObject`. Il
/// était DÉCLARÉ dans l'en-tête de la planche et employé dans **aucune** de ses
/// vingt-huit règles — mesuré le 2026-08-28, y compris sur les huit paragraphes
/// écrits ce jour-là.
///
/// > Une règle qui ne nomme aucun niveau décrit un comportement dont on ne sait
/// > pas ce qu'il touche. C'est la forme sous laquelle deux lots finissent par
/// > se contredire sans qu'aucun des deux n'ait tort.
///
/// La garde lit la planche et exige que **chaque paragraphe de règle** nomme au
/// moins un niveau du modèle, une pièce du chrome, ou un plan. Elle ne juge pas
/// la prose : elle interdit qu'une règle soit muette sur son objet.
final class PlancheVocabularyGuardTests: XCTestCase {

    /// Les quatre noms du CONTENU (modèle § 1).
    private let modele = try! NSRegularExpression(pattern: "Meeshy(Object|Scene|Slide|Publication)")

    /// Les pièces du CHROME (planche, « Ce que les quatre noms NE couvrent pas »).
    private let chrome = try! NSRegularExpression(
        pattern: "\\b(socle|rail|éventail|plateau|barre haute|rangée d.outils|inspecteur|amorces?|scène incrustée|surface)\\b",
        options: [.caseInsensitive]
    )

    /// Les trois plans d'une scène.
    private let plans = try! NSRegularExpression(pattern: "`(background|content|foreground)`")

    func test_chaqueRegleDeLaPlanche_nommeLeNiveauSurLequelElleAgit() throws {
        let regles = try paragraphesDeRegle()
        XCTAssertGreaterThan(
            regles.count, 20,
            "Moins de vingt règles lues — la garde ne mesurerait presque RIEN. Le découpage a changé."
        )

        let muets = regles.filter { paragraphe in
            ![modele, chrome, plans].contains { nomme($0, dans: paragraphe) }
        }
        XCTAssertEqual(
            muets.map { $0.prefix(90) }, [],
            "Ces règles ne nomment ni niveau du modèle, ni pièce du chrome, ni plan. Une règle muette "
                + "sur son objet ne dit pas ce qu'elle touche — c'est ainsi que deux lots se "
                + "contredisent sans qu'aucun n'ait tort. Vocabulaire : `meeshy-composer-modele.md` § 1 "
                + "(contenu) et la planche § « Ce que les quatre noms NE couvrent pas » (chrome)."
        )
    }

    /// Le fusible. Sans lui, un chemin devenu faux rendrait la garde verte sur
    /// zéro paragraphe — le mode d'extinction propre aux gardes qui comptent.
    func test_laGarde_litVraimentLaPlanche() throws {
        let texte = try plancheSource()
        XCTAssertGreaterThan(texte.count, 5000, "Planche introuvable ou tronquée.")
        XCTAssertTrue(
            texte.contains("MeeshyPublication"),
            "Le bloc de vocabulaire a disparu de la planche — la garde n'aurait plus de référence."
        )
    }

    /// **La moitié POSITIVE.** Sans elle, vider la planche de ses règles rendrait
    /// la garde ci-dessus verte : zéro règle, zéro muette.
    func test_laPlanche_nommeLesQuatreNomsDuModele() throws {
        let texte = try plancheSource()
        for nom in ["MeeshyPublication", "MeeshySlide", "MeeshyScene", "MeeshyObject"] {
            XCTAssertGreaterThanOrEqual(
                occurrences(nom, dans: texte), 2,
                "`\(nom)` doit être employé dans les RÈGLES, pas seulement déclaré une fois en en-tête — "
                    + "c'est exactement l'état que ce lot corrige."
            )
        }
    }

    // MARK: - Lecture

    private func paragraphesDeRegle() throws -> [String] {
        try plancheSource()
            .components(separatedBy: "\n\n")
            .filter { $0.trimmingCharacters(in: .whitespacesAndNewlines).hasPrefix("**") }
    }

    private func plancheSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("docs/product/planche-meeshy-composer.md")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func nomme(_ motif: NSRegularExpression, dans texte: String) -> Bool {
        motif.firstMatch(in: texte, range: NSRange(texte.startIndex..., in: texte)) != nil
    }

    private func occurrences(_ aiguille: String, dans meule: String) -> Int {
        meule.components(separatedBy: aiguille).count - 1
    }
}
