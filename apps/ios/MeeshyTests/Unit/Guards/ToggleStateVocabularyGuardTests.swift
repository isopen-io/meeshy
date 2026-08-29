import XCTest

/// **Le vocabulaire d'une bascule ne se ré-écrit pas à la main.**
///
/// `toggleStateAccessibility` a vécu cinq ans de sa vie sous le nom
/// `callToggleAccessibility`, dans `CallView.swift`. Rien dedans n'était propre
/// aux appels — et pourtant **cinq sites l'appliquaient, tous des surfaces
/// d'appel**, pendant que quatre bascules ailleurs ne disaient leur état que
/// par une couleur (253i, #4266).
///
/// Une garde qui interdirait seulement la RE-CRÉATION du modificateur ne
/// suffirait pas : le défaut de 253i n'était pas qu'on l'avait recopié, c'est
/// qu'on ne l'avait **pas trouvé**. Ces deux règles gardent donc la source
/// unique par ses deux faces — sa CLÉ et son TRAIT — qui sont les deux choses
/// qu'un site rééecrirait s'il ne savait pas qu'elle existe.
final class ToggleStateVocabularyGuardTests: XCTestCase {

    private var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Guards
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent("Meeshy")
    }

    private static let sourceOfTruth = "ToggleStateAccessibility.swift"
    private static let reservedKeys = ["a11y.toggle.on", "a11y.toggle.off"]
    private static let reservedTrait = "accessibilityAddTraits(.isToggle)"

    /// Les clés d'état ne se citent que depuis la source unique — sinon un site
    /// sert « Activé » sans le trait, et le rotor VoiceOver n'a plus de bascule
    /// à annoncer. (Motif de la règle des clés de #4248.)
    func test_lesClesDEtatNeSeCitentQueDepuisLaSourceUnique() throws {
        let violations = scan { line in
            Self.reservedKeys.first(where: { line.contains("\"\($0)\"") })
        }
        XCTAssertTrue(
            violations.isEmpty,
            "Clés `a11y.toggle.*` citées hors de leur source unique — passer par "
            + "`.toggleStateAccessibility(isToggle:isActive:)`, qui pose la valeur ET le "
            + "trait ensemble :\n" + violations.joined(separator: "\n")
        )
    }

    /// Et le TRAIT non plus : le poser à la main, c'est ré-écrire la moitié de
    /// la règle — celle qui se souvient du repli sous iOS 17.
    func test_leTraitDeBasculeNeSePoseQueDepuisLaSourceUnique() throws {
        let violations = scan { line in
            line.contains(Self.reservedTrait) ? Self.reservedTrait : nil
        }
        XCTAssertTrue(
            violations.isEmpty,
            "`.accessibilityAddTraits(.isToggle)` posé à la main : la source unique le "
            + "pose DÉJÀ, derrière son `#available(iOS 17, *)`. Un site qui l'écrit lui-même "
            + "oublie tôt ou tard la valeur qui va avec, ou le repli :\n"
            + violations.joined(separator: "\n")
        )
    }

    /// La source unique porte bien les deux moitiés qu'elle réserve — sans quoi
    /// les deux règles ci-dessus seraient vertes en gardant du vide.
    func test_laSourceUniquePorteLesDeuxMoitiesDeLaRegle() throws {
        let text = try String(
            contentsOf: appRoot
                .appendingPathComponent("Features/Main/Components")
                .appendingPathComponent(Self.sourceOfTruth),
            encoding: .utf8
        )
        for key in Self.reservedKeys {
            XCTAssertTrue(text.contains("\"\(key)\""), "clé \(key) absente de la source unique")
        }
        XCTAssertTrue(text.contains(Self.reservedTrait), "le trait doit être posé par la source unique")
        XCTAssertTrue(text.contains("#available(iOS 17, *)"),
                      "le repli sous iOS 17 fait partie de la règle : le trait n'y existe pas, la valeur si")
    }

    /// Borne : le scanner reconnaît ce qu'il interdit, et ne prend pas l'appel
    /// correct pour la faute (leçon 248i).
    func test_leScannerReconnaitCeQuIlInterdit() {
        let cle = #"            .accessibilityValue(String(localized: "a11y.toggle.on"))"#
        let trait = "            .accessibilityAddTraits(.isToggle)"
        let correctif = "        .toggleStateAccessibility(isToggle: true, isActive: isMuted)"

        XCTAssertTrue(Self.reservedKeys.contains { cle.contains("\"\($0)\"") },
                      "une clé réservée citée ailleurs doit être vue")
        XCTAssertTrue(trait.contains(Self.reservedTrait), "le trait posé à la main doit être vu")
        XCTAssertFalse(Self.reservedKeys.contains { correctif.contains("\"\($0)\"") },
                       "le correctif ne doit pas être pris pour la faute")
        XCTAssertFalse(correctif.contains(Self.reservedTrait),
                       "le correctif ne doit pas être pris pour la faute")
    }

    private func scan(_ probe: (String) -> String?) -> [String] {
        guard let walker = FileManager.default.enumerator(at: appRoot, includingPropertiesForKeys: nil)
        else { return [] }
        var found: [String] = []
        for case let file as URL in walker
        where file.pathExtension == "swift" && file.lastPathComponent != Self.sourceOfTruth {
            let text = (try? String(contentsOf: file, encoding: .utf8)) ?? ""
            for (index, line) in text.components(separatedBy: .newlines).enumerated() {
                guard !line.trimmingCharacters(in: .whitespaces).hasPrefix("//") else { continue }
                if let hit = probe(line) {
                    found.append("\(file.lastPathComponent):\(index + 1)  \(hit)")
                }
            }
        }
        return found.sorted()
    }
}
