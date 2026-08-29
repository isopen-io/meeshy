import XCTest

/// **Un contrôle dont la zone sensible EST son dessin.**
///
/// Quand le label d'un `Button` commence par une FORME nue — `Circle`,
/// `RoundedRectangle`, `Capsule`… — la zone sensible du bouton est exactement
/// le cadre de cette forme. Rien ne l'élargit : pas de texte qui pousse, pas de
/// `Label` qui impose sa hauteur de ligne, pas de `padding` qu'un glyphe
/// hériterait. **Le dessin devient la cible**, et un dessin décoratif est
/// presque toujours plus petit que les 44 pt de la HIG.
///
/// Trois sites du dépôt étaient dans ce cas, et les trois se ressemblaient si
/// peu qu'aucune revue ne les avait rapprochés :
///
/// | site | dessin | cible réelle |
/// |---|---|---|
/// | `InteractiveProgressBar` ×8 (inscription) | trait de 5 à 8 pt | ~41 × 5 pt |
/// | `ComposerSceneBand.palette` ×17 | disque de 28 pt | 28 × 28 pt |
/// | `ComposerDocumentSurface` ×17 | disque de 28 pt | 28 × 28 pt |
///
/// Les deux palettes portaient bien 8 pt de marge verticale — mais posée sur le
/// `HStack` PARENT, donc **hors du bouton**. La bande mesurait 44 pt de haut et
/// n'en écoutait que 28. C'est le trait commun de la famille : un espace qui
/// AÈRE n'est pas un espace qui RÉPOND.
///
/// La garde ferme la forme : **le label d'un bouton qui commence par une forme
/// nue doit déclarer sa zone sensible** — un cadre d'au moins 44 pt, un
/// `maxWidth: .infinity` qui remplit sa cellule, ou `meeshyTapTarget`. Elle ne
/// juge pas la valeur : c'est aux tests unitaires des hôtes de la fixer
/// (`InteractiveProgressBar.rowHeight`, `BackgroundColorPalette.hitSide`).
final class BareShapeTapTargetGuardTests: XCTestCase {

    private var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Guards
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent("Meeshy")
    }

    private static let shapes = [
        "RoundedRectangle(", "Circle(", "Rectangle(", "Capsule(", "Ellipse(",
        "UnevenRoundedRectangle(",
    ]

    /// Ce qui compte comme déclaration d'une zone sensible.
    private static let hitRegionDeclarations = [
        "minHeight:", "maxWidth: .infinity", "meeshyTapTarget",
        "hitSide", "rowHeight",
    ]

    func test_unBoutonDessineNeLaisseJamaisSonDessinFaireLaCible() throws {
        var violations: [String] = []
        for file in swiftFiles(under: appRoot) {
            let lines = ((try? String(contentsOf: file, encoding: .utf8)) ?? "")
                .components(separatedBy: .newlines)
            for (index, line) in lines.enumerated() where Self.opensAButtonLabel(line) {
                guard Self.mentionsButton(in: lines, endingAt: index) else { continue }
                guard let first = Self.firstRenderedLine(in: lines, after: index),
                      Self.shapes.contains(where: { lines[first].trimmingCharacters(in: .whitespaces).hasPrefix($0) })
                else { continue }
                let label = lines[index..<min(index + 25, lines.count)].joined(separator: "\n")
                guard !Self.declaresAHitRegion(label) else { continue }
                violations.append("\(file.lastPathComponent):\(index + 1)")
            }
        }
        XCTAssertTrue(
            violations.isEmpty,
            "Le label de ce bouton commence par une forme nue et ne déclare aucune zone "
            + "sensible : sa cible tactile EST son dessin, presque toujours sous les 44 pt "
            + "de la HIG. Poser le cadre et le `contentShape` DANS le label :\n"
            + violations.sorted().joined(separator: "\n")
        )
    }

    /// Sans cette borne, la règle serait verte parce qu'elle ne voit rien.
    func test_leScannerReconnaitLaFormeQuIlInterdit() {
        let lines = [
            "                    } label: {",
            "                        Circle()",
            "                            .fill(.red)",
            "                            .frame(width: 28, height: 28)",
            "                    }",
        ]
        XCTAssertTrue(Self.opensAButtonLabel(lines[0]))
        XCTAssertEqual(Self.firstRenderedLine(in: lines, after: 0), 1)
        XCTAssertFalse(Self.declaresAHitRegion(lines.joined(separator: "\n")))

        let fixed = lines.joined(separator: "\n") + "\n.frame(minHeight: 44)"
        XCTAssertTrue(Self.declaresAHitRegion(fixed),
                      "un cadre de 44 pt doit être reconnu comme une zone sensible déclarée")
    }

    /// Et les deux hôtes soldés ici fixent bien leur cible à la valeur de la
    /// HIG — la garde de forme ne le dit pas, ces deux assertions oui.
    @MainActor
    func test_lesDeuxHotesFixentLeurCibleAuMinimumDeLaHIG() {
        XCTAssertEqual(InteractiveProgressBar.rowHeight, 44)
        XCTAssertEqual(BackgroundColorPalette.hitSide, 44)
        XCTAssertEqual(BackgroundColorPalette.swatchDiameter, 28,
                       "le DESSIN ne change pas : c'est la cible qui grandit")
    }

    // MARK: - Outillage

    private static func opensAButtonLabel(_ line: String) -> Bool {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        guard trimmed.hasSuffix("{") else { return false }
        return trimmed.hasSuffix("} label: {")
            || trimmed.hasSuffix("}) {")
            || trimmed.hasPrefix("Button {")
            || (trimmed.hasPrefix("Button(action:") && trimmed.hasSuffix(") {"))
    }

    /// `}) {` et `} label: {` ferment beaucoup de choses : seul un `Button`
    /// ouvert dans les huit lignes précédentes nous intéresse.
    private static func mentionsButton(in lines: [String], endingAt index: Int) -> Bool {
        lines[max(0, index - 8)...index].contains { $0.contains("Button") }
    }

    private static func firstRenderedLine(in lines: [String], after index: Int) -> Int? {
        var cursor = index + 1
        while cursor < lines.count {
            let trimmed = lines[cursor].trimmingCharacters(in: .whitespaces)
            if !trimmed.isEmpty && !trimmed.hasPrefix("//") { return cursor }
            cursor += 1
        }
        return nil
    }

    private static func declaresAHitRegion(_ label: String) -> Bool {
        if hitRegionDeclarations.contains(where: { label.contains($0) }) { return true }
        // Un cadre EXPLICITE d'au moins 44 pt en fait aussi office : le bouton
        // « lire » d'un aperçu vidéo dessine un disque de 52 pt, et c'est une
        // cible parfaitement valide.
        return ["width:", "height:"].contains { keyword in
            dimensions(named: keyword, in: label).contains { $0 >= 44 }
        }
    }

    /// Les valeurs numériques littérales qui suivent `keyword` dans le texte.
    /// Écrit à la main plutôt qu'avec `Regex` : la garde doit rester lisible et
    /// ne dépendre d'aucune disponibilité de plateforme.
    private static func dimensions(named keyword: String, in text: String) -> [Int] {
        var values: [Int] = []
        var rest = Substring(text)
        while let hit = rest.range(of: keyword) {
            let tail = rest[hit.upperBound...].drop(while: { $0 == " " })
            let digits = tail.prefix(while: { $0.isNumber })
            if let value = Int(digits) { values.append(value) }
            rest = rest[hit.upperBound...]
        }
        return values
    }

    private func swiftFiles(under root: URL) -> [URL] {
        guard let enumerator = FileManager.default.enumerator(
            at: root, includingPropertiesForKeys: nil
        ) else { return [] }
        return enumerator.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }
}
