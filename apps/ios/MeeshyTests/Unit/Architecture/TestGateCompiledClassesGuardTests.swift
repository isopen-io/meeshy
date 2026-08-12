import XCTest

/// Garde du GATE de tests lui-même : `meeshy.sh` doit prouver que les classes
/// qu'il sélectionne existent dans le BUNDLE COMPILÉ, pas seulement dans les
/// sources.
///
/// Mécanique du trou (incident 2026-08-11) : `discover_test_classes()` construit
/// le manifeste `-only-testing` en grepant `MeeshyTests/**/*.swift`. Un fichier
/// de test créé sans être enregistré dans `Meeshy.xcodeproj/project.pbxproj`
/// (le projet énumère ses sources explicitement, sans
/// `PBXFileSystemSynchronizedRootGroup`) y figure donc quand même, alors qu'il
/// n'est PAS compilé : `nm` sur `MeeshyTests.xctest` en donne 0 symbole,
/// xcodebuild ne se plaint pas d'une classe sélectionnée qui n'existe pas, et le
/// gate reste VERT. `MessageMoreJumpsToViewsGuardTests` a vécu deux commits
/// ainsi — trois gardes promises, zéro exécutée.
///
/// Conséquence de méthode : la présence d'une classe dans le manifeste
/// `-only-testing` n'est JAMAIS une preuve d'exécution. Seule la présence de son
/// symbole dans `MeeshyTests.xctest` (ou une ligne « Executed N tests » la
/// nommant) fait foi — c'est exactement ce que cette garde impose au script.
///
/// Les motifs sont cherchés APRÈS retrait des commentaires `#` : les blocs
/// explicatifs de `meeshy.sh` citent ces noms et satisferaient seuls les
/// assertions.
final class TestGateCompiledClassesGuardTests: XCTestCase {

    private static let orphanGuardHelper = "verify_test_classes_are_compiled"
    private static let testBundleName = "MeeshyTests.xctest"

    private var iosDirectory: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Architecture
            .deletingLastPathComponent()  // Unit
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // ios
    }

    private func script() throws -> String {
        strippingHashComments(
            try String(
                contentsOf: iosDirectory.appendingPathComponent("meeshy.sh"),
                encoding: .utf8
            )
        )
    }

    // MARK: - L'helper doit interroger le binaire, pas les sources

    func test_orphanGuard_readsTheCompiledTestBundleNotOnlyTheSources() throws {
        let functions = shellFunctions(in: try script())

        guard let guardFunction = functions.first(where: { $0.name == Self.orphanGuardHelper }) else {
            XCTFail(
                "meeshy.sh doit définir \(Self.orphanGuardHelper)() : sans elle, une classe absente " +
                "du pbxproj part dans le manifeste -only-testing sans jamais s'exécuter."
            )
            return
        }

        XCTAssertTrue(
            guardFunction.body.contains(Self.testBundleName),
            "\(Self.orphanGuardHelper)() doit inspecter \(Self.testBundleName) — le bundle compilé " +
            "est la seule preuve d'exécution ; relire les sources reproduirait le trou."
        )
        XCTAssertTrue(
            guardFunction.body.contains("nm "),
            "\(Self.orphanGuardHelper)() doit lire les SYMBOLES du bundle (nm) : une classe non " +
            "compilée n'y laisse aucune trace, c'est le signal recherché."
        )
        XCTAssertTrue(
            guardFunction.body.contains("discover_test_classes"),
            "\(Self.orphanGuardHelper)() doit confronter le manifeste issu des sources " +
            "(discover_test_classes) au bundle compilé — sinon elle ne compare rien."
        )
        XCTAssertTrue(
            guardFunction.body.contains("return 1"),
            "\(Self.orphanGuardHelper)() doit sortir non-zéro sur orphelin : un simple log laisse " +
            "passer un gate vert avec des tests morts."
        )
    }

    // MARK: - Le verdict doit peser sur le code de sortie du gate

    func test_testGate_runsTheOrphanGuardAndLetsItFailTheRun() throws {
        let functions = shellFunctions(in: try script())

        guard let doTest = functions.first(where: { $0.name == "do_test" }) else {
            XCTFail("do_test() a disparu de meeshy.sh — le découpage de la garde est à revoir.")
            return
        }

        XCTAssertTrue(
            doTest.body.contains(Self.orphanGuardHelper),
            "do_test() doit appeler \(Self.orphanGuardHelper)() après build-for-testing, avant de " +
            "faire confiance au manifeste -only-testing des phases 1/2."
        )

        let returnLine = doTest.body
            .components(separatedBy: "\n")
            .last { $0.contains("return $((") }
        XCTAssertNotNil(
            returnLine,
            "do_test() ne calcule plus son code de sortie par une expression `return $((...))`."
        )
        XCTAssertTrue(
            returnLine?.contains("orphan") == true,
            "Le verdict de \(Self.orphanGuardHelper)() doit entrer dans le code de sortie de " +
            "do_test() : détecté mais ignoré, il rendrait le gate vert malgré des tests morts."
        )
    }

    // MARK: - Découpage shell (même mécanique qu'ArchiveSignatureStripGuardTests)

    private struct ShellFunction {
        let name: String
        let body: String
    }

    private func shellFunctions(in script: String) -> [ShellFunction] {
        var functions: [ShellFunction] = []
        var currentName: String?
        var currentBody: [String] = []

        for line in script.components(separatedBy: "\n") {
            if currentName == nil {
                guard let name = functionName(openedBy: line) else { continue }
                currentName = name
                currentBody = []
                continue
            }
            if line == "}" {
                functions.append(ShellFunction(name: currentName!, body: currentBody.joined(separator: "\n")))
                currentName = nil
                continue
            }
            currentBody.append(line)
        }
        return functions
    }

    private func functionName(openedBy line: String) -> String? {
        guard line.hasSuffix("() {") else { return nil }
        let name = String(line.dropLast(4))
        guard !name.isEmpty, name.allSatisfy({ $0.isLetter || $0.isNumber || $0 == "_" }) else { return nil }
        return name
    }

    /// Retire les commentaires `#` de fin de ligne en respectant les littéraux
    /// entre guillemets et les `${#array[@]}` du shell.
    private func strippingHashComments(_ source: String) -> String {
        source.components(separatedBy: "\n").map { line -> String in
            var output = ""
            var quote: Character?
            var previous: Character?
            for character in line {
                if let open = quote {
                    output.append(character)
                    if character == open && previous != "\\" { quote = nil }
                } else if character == "\"" || character == "'" {
                    quote = character
                    output.append(character)
                } else if character == "#" && previous != "$" && previous != "{" {
                    break
                } else {
                    output.append(character)
                }
                previous = character
            }
            return output
        }.joined(separator: "\n")
    }
}
