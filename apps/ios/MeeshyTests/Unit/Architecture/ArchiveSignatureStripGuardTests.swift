import XCTest

/// Garde contre la RÉAPPARITION d'ITMS-90035 (« Invalid Signature — Code failed
/// to satisfy specified code requirement(s) ») sur les XCFrameworks binaires
/// Google/Firebase embarqués (FirebaseAnalytics, GoogleAdsOnDeviceConversion,
/// GoogleAppMeasurement, GoogleAppMeasurementIdentitySupport).
///
/// Mécanique du rejet : à l'action `archive`, la signature automatique signe les
/// frameworks embarqués avec **Apple Development** puis `-exportArchive` les
/// re-signe en Distribution — un « replacing existing signature » qui laisse des
/// métadonnées résiduelles que l'analyseur d'App Store Connect refuse. Le seul
/// garde-fou du dépôt est `ci_scripts/ci_post_xcodebuild.sh`, qui retire ces
/// signatures ENTRE l'archive et l'export pour que la re-signature soit fraîche.
///
/// Ce que cette garde protège : le script n'a de valeur que s'il est branché sur
/// TOUS les chemins qui produisent une archive. Il l'était sur trois d'entre eux
/// (commit eb3c47309), jusqu'à ce que la migration XcodeGen régénère le scheme
/// partagé et efface silencieusement la post-action d'archive — `project.yml`,
/// devenu source de vérité, ne la déclarait pas. Tout archivage Xcode GUI a
/// produit des binaires rejetés à partir de là, sans qu'aucun signal ne le dise.
///
/// Les motifs sont cherchés APRÈS retrait des commentaires : ce fichier-ci et
/// les blocs explicatifs de `meeshy.sh` / `project.yml` citent le nom du script,
/// et satisferaient seuls les assertions.
final class ArchiveSignatureStripGuardTests: XCTestCase {

    private static let stripScript = "ci_post_xcodebuild.sh"
    private static let verifyScript = "verify_embedded_signatures.sh"
    private static let stripHelper = "strip_embedded_signatures"
    private static let verifyHelper = "verify_embedded_signatures"
    private static let identifierFixScript = "fix_codeless_framework_identifiers.sh"

    private var iosDirectory: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Architecture
            .deletingLastPathComponent()  // Unit
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // ios
    }

    private var repositoryRoot: URL {
        iosDirectory
            .deletingLastPathComponent()  // apps
            .deletingLastPathComponent()  // <repo>
    }

    private func contents(of url: URL) throws -> String {
        try String(contentsOf: url, encoding: .utf8)
    }

    /// Retire les commentaires `#` de fin de ligne des sources shell/YAML, en
    /// respectant les littéraux entre guillemets (un `"#6366F1"` n'ouvre pas un
    /// commentaire) et les `${#array[@]}` du shell.
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

    // MARK: - Correctif à la source (build phase)

    /// Le correctif qui rend la distribution App Store depuis Xcode Cloud
    /// possible est une BUILD PHASE, pas un hook post-archive : sur Xcode Cloud,
    /// `ci_post_xcodebuild.sh` s'exécute après les exports (run 1742 : exports
    /// 19:11:06→19:11:09, hook 19:11:30) et ne peut donc rien corriger. La phase
    /// tourne pendant le build, avant tout export, sur tous les chemins.
    func test_projectSpec_runsCodelessIdentifierFixAsBuildPhase() throws {
        let spec = strippingHashComments(
            try contents(of: iosDirectory.appendingPathComponent("project.yml"))
        )

        XCTAssertTrue(
            spec.contains("postBuildScripts"),
            "project.yml ne déclare plus de postBuildScripts : le correctif ITMS-90035 ne tournerait plus pendant le build."
        )
        XCTAssertTrue(
            spec.contains(Self.identifierFixScript),
            "project.yml ne branche pas \(Self.identifierFixScript) — Xcode Cloud reproduira le rejet ITMS-90035."
        )
    }

    /// Le pbxproj committé est ce qu'ouvre Xcode ; une régénération qui perdrait
    /// la phase rendrait le correctif inopérant sans rien casser d'autre.
    func test_generatedProject_carriesCodelessIdentifierFixPhase() throws {
        let pbxproj = try contents(
            of: iosDirectory.appendingPathComponent("Meeshy.xcodeproj/project.pbxproj")
        )

        XCTAssertTrue(
            pbxproj.contains(Self.identifierFixScript),
            "La build phase de correction des identifiers a disparu du projet généré."
        )
    }

    // MARK: - Source de vérité XcodeGen

    /// `project.yml` DOIT déclarer la post-action d'archive. C'est le seul
    /// endroit qui survit à `xcodegen generate` — le scheme committé, lui, est
    /// un artefact régénéré à chaque build CI.
    func test_projectSpec_declaresArchivePostActionInvokingStripScript() throws {
        let spec = strippingHashComments(
            try contents(of: iosDirectory.appendingPathComponent("project.yml"))
        )

        XCTAssertTrue(
            spec.contains("postActions"),
            "project.yml ne déclare aucune postActions : xcodegen effacera la post-action d'archive du scheme."
        )
        XCTAssertTrue(
            spec.contains(Self.stripScript),
            "project.yml ne branche pas \(Self.stripScript) — un archivage Xcode GUI produira un binaire rejeté ITMS-90035."
        )
    }

    /// Le scheme partagé committé est ce que Xcode GUI lit réellement. Un
    /// `project.yml` correct mais un scheme périmé laisse le trou ouvert pour
    /// quiconque archive sans avoir régénéré le projet.
    func test_sharedScheme_carriesArchivePostActionInvokingStripScript() throws {
        let scheme = try contents(
            of: iosDirectory
                .appendingPathComponent("Meeshy.xcodeproj/xcshareddata/xcschemes/Meeshy.xcscheme")
        )

        XCTAssertTrue(
            scheme.contains("<PostActions>"),
            "Le scheme partagé n'a plus de PostActions — régénérer le projet après avoir corrigé project.yml."
        )
        XCTAssertTrue(
            scheme.contains(Self.stripScript),
            "Le scheme partagé n'invoque pas \(Self.stripScript) après l'archive."
        )
    }

    // MARK: - Chemins d'archive locaux

    /// Toute fonction de `meeshy.sh` qui lance `xcodebuild archive` doit aussi
    /// déclencher le strip. Ancré sur la FONCTION plutôt que sur une fenêtre de
    /// lignes : un déplacement de code ne fait pas pourrir la garde.
    func test_meeshyScript_stripsSignaturesInEveryArchivingFunction() throws {
        let functions = shellFunctions(
            in: strippingHashComments(
                try contents(of: iosDirectory.appendingPathComponent("meeshy.sh"))
            )
        )

        let archivingFunctions = functions.filter { $0.body.contains("xcodebuild archive") }

        XCTAssertFalse(
            archivingFunctions.isEmpty,
            "Aucune fonction archivante détectée dans meeshy.sh — le découpage de la garde est à revoir."
        )

        for function in archivingFunctions {
            XCTAssertTrue(
                function.body.contains(Self.stripHelper),
                "\(function.name)() archive sans appeler \(Self.stripHelper) : l'IPA produit sera rejeté ITMS-90035."
            )
        }

        // L'indirection ne vaut que si l'helper invoque réellement le script :
        // sans cette assertion, un helper vidé de sa substance satisferait la
        // boucle ci-dessus tout en ne strippant plus rien.
        let helper = functions.first { $0.name == Self.stripHelper }
        XCTAssertNotNil(helper, "\(Self.stripHelper)() a disparu de meeshy.sh.")
        XCTAssertTrue(
            helper?.body.contains(Self.stripScript) == true,
            "\(Self.stripHelper)() n'invoque plus \(Self.stripScript) — le strip est devenu un no-op silencieux."
        )
    }

    /// Le strip est aveugle : il ne dit rien quand il ne tourne pas. Chaque
    /// chemin qui produit un IPA doit donc VÉRIFIER le produit exporté, seul
    /// contrôle qui échoue localement au lieu d'attendre le courriel d'Apple.
    func test_meeshyScript_verifiesSignaturesOfEveryExportedIPA() throws {
        let functions = shellFunctions(
            in: strippingHashComments(
                try contents(of: iosDirectory.appendingPathComponent("meeshy.sh"))
            )
        )

        let exportingFunctions = functions.filter { $0.body.contains("xcodebuild -exportArchive") }

        XCTAssertFalse(
            exportingFunctions.isEmpty,
            "Aucune fonction exportante détectée dans meeshy.sh — le découpage de la garde est à revoir."
        )

        for function in exportingFunctions {
            XCTAssertTrue(
                function.body.contains(Self.verifyHelper),
                "\(function.name)() exporte un IPA sans appeler \(Self.verifyHelper)."
            )
        }

        let helper = functions.first { $0.name == Self.verifyHelper }
        XCTAssertNotNil(helper, "\(Self.verifyHelper)() a disparu de meeshy.sh.")
        XCTAssertTrue(
            helper?.body.contains(Self.verifyScript) == true,
            "\(Self.verifyHelper)() n'invoque plus \(Self.verifyScript)."
        )
    }

    /// La lane fastlane a été le premier point de branchement et reste le
    /// chemin de référence : elle ne doit pas le perdre à son tour.
    func test_fastlaneProductionLane_invokesStripBetweenArchiveAndExport() throws {
        let fastfile = try contents(of: iosDirectory.appendingPathComponent("fastlane/Fastfile"))

        XCTAssertTrue(
            fastfile.contains(Self.stripScript),
            "La lane build_production n'invoque plus \(Self.stripScript) entre l'archive et l'export."
        )
        XCTAssertTrue(
            fastfile.contains(Self.verifyScript),
            "La lane build_production ne vérifie plus l'IPA exporté avec \(Self.verifyScript)."
        )
    }

    /// Le workflow de release CI archive avec `xcodebuild` directement, donc
    /// sans bénéficier ni de la post-action du scheme ni de la lane fastlane.
    func test_releaseWorkflow_invokesStripAfterArchive() throws {
        let workflow = try contents(
            of: repositoryRoot.appendingPathComponent(".github/workflows/ios-release.yml")
        )

        XCTAssertTrue(
            workflow.contains(Self.stripScript),
            "ios-release.yml archive sans strip — l'IPA uploadé par ANDP sera rejeté ITMS-90035."
        )
        XCTAssertTrue(
            workflow.contains(Self.verifyScript),
            "ios-release.yml n'a plus de gate \(Self.verifyScript) sur l'IPA exporté."
        )
    }

    // MARK: - Découpage shell

    private struct ShellFunction {
        let name: String
        let body: String
    }

    /// Découpe un source shell en fonctions `nom() {` … `}` (accolade fermante
    /// en colonne 0, convention respectée par `meeshy.sh`).
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
}
