import XCTest
@testable import Meeshy

/// F-090 (WS-11) — gardes de source PLEIN ARBRE sur `Focal/**` (contrat §WS-11,
/// registre §7-R15, §5.1, règle §8-9). Complémentaire aux gardes PAR DOSSIER
/// déjà livrées par WS-3..WS-10 (`FocalRowSourceGuardTests`,
/// `FocalScrollPassSourceGuardTests`, `FocalHostSourceGuardTests`,
/// `ScrollTimePillSourceGuardTests`, …) : celles-ci ne balaient chacune QUE
/// leur propre sous-dossier. Quatre invariants du contrat sont au contraire
/// posés sur `Focal/**` ENTIER — aucun agent WS-3..WS-10 n'a de raison de les
/// répéter par dossier, et WS-11 est le dernier merge (« il livre les
/// preuves ») :
///
/// 1. « Aucune bulle nulle part » (§WS-11) — `BubbleBackground` /
///    `BubbleStandardLayout` / `cornerRadius: 18` interdits partout.
/// 2. « Aucune police fixe » (§8, règle 9) — `.font(.system(size:` interdit
///    partout.
/// 3. « Un seul point de branchement invité » (§5.1) — `anonymousSession`,
///    `isAnonymous`, `authManager.currentUser` interdits partout SAUF
///    `Preferences/ConversationViewerIdentityResolver.swift` (le convertisseur
///    signal brut → `ConversationViewerIdentity`, WS-1) et `Core/**` (WS-0 —
///    domicile du TYPE `ConversationViewerIdentity.isAnonymous` lui-même et de
///    `ConversationCapabilitySet.resolve`, le point de branchement UNIQUE que
///    §5.1 désigne littéralement comme habilité à lire l'identité ; l'exclure
///    reviendrait à interdire au type et à son unique consommateur légitime
///    de faire leur travail — la RE-PREUVE `test_identityProbe_` ci-dessous
///    documente ce choix).
/// 4. « Zéro constante de loi » (garde R15, alignée sur
///    `scripts/check-law-literals.sh`) — les littéraux de
///    `FocalFocusCurve`/`ScrollTimePillLaw` interdits partout SAUF `Core/**`
///    (les miroirs GELÉS eux-mêmes) et `Scroll/FocalPassConstants.swift` (le
///    domicile documenté des « cotes hors-token », `FocalScrollPassSourceGuardTests`
///    l'exclut déjà de son propre balayage pour la même raison).
///
/// Leçon 257 : un scan qui trouve ZÉRO fichier ne doit jamais passer au vert
/// silencieusement — chaque garde affirme un plancher de fichiers balayés.
/// Messages d'échec en français, désignant le fichier fautif (leçon 265).
final class FocalNoBubbleSourceGuardTests: XCTestCase {

    // MARK: - Arborescence

    private func focalRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Focal
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Focal")
    }

    private struct SourceFile {
        let relativePath: String   // ex. "Row/FocalMetaRow.swift" — toujours relatif à Focal/
        let stripped: String       // commentaires retirés (AppSourceGuard, machine à états)
    }

    /// Balaie `Focal/**` récursivement. `excludingTopLevelDirectories` filtre
    /// par PREMIER segment du chemin relatif (ex. "Core") — même sémantique
    /// que `-not -path "$dir/Core/*"` de `scripts/check-law-literals.sh`
    /// (exclusion CIBLÉE à l'immédiat `Core/` sous Focal, jamais un
    /// `--exclude-dir=Core` global qui sauterait un `Core/` ailleurs dans le
    /// dépôt).
    private func swiftSources(
        excludingTopLevelDirectories: Set<String> = [],
        excludingRelativePaths: Set<String> = []
    ) throws -> [SourceFile] {
        let root = focalRoot()
        let enumerator = try XCTUnwrap(
            FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil),
            "impossible d'énumérer \(root.path) — l'arborescence Focal/** a-t-elle bougé ?"
        )
        var out: [SourceFile] = []
        for case let url as URL in enumerator where url.pathExtension == "swift" {
            let relative = url.path.replacingOccurrences(of: root.path + "/", with: "")
            if let firstSegment = relative.split(separator: "/").first,
               excludingTopLevelDirectories.contains(String(firstSegment)) {
                continue
            }
            if excludingRelativePaths.contains(relative) { continue }
            let code = try String(contentsOf: url, encoding: .utf8)
            out.append(SourceFile(relativePath: relative, stripped: AppSourceGuard.stripComments(code)))
        }
        return out
    }

    // MARK: - 1. Aucune bulle nulle part

    func test_noBubbleAnywhereInFocal() throws {
        let files = try swiftSources()
        XCTAssertGreaterThan(
            files.count, 20,
            "le balayage de Focal/** ne trouve presque aucun fichier — la garde « aucune bulle » " +
            "passerait au vert par omission (leçon 257), pas par absence réelle de bulle"
        )

        let forbidden = ["BubbleBackground", "BubbleStandardLayout", "cornerRadius: 18", "cornerRadius:18"]
        var offenders: [String: [String]] = [:]
        for file in files {
            for needle in forbidden where file.stripped.contains(needle) {
                offenders[file.relativePath, default: []].append(needle)
            }
        }
        XCTAssertTrue(
            offenders.isEmpty,
            "ces fichiers de Focal/** référencent la bulle historique — « aucune bulle nulle part » " +
            "(§WS-11) : " + offenders.map { "\($0.key) [\($0.value.joined(separator: ", "))]" }
                .sorted().joined(separator: " ; ")
        )
    }

    // MARK: - 2. Aucune police fixe (§8, règle 9)

    func test_noFixedFontAnywhereInFocal() throws {
        let files = try swiftSources()
        XCTAssertGreaterThan(
            files.count, 20,
            "le balayage de Focal/** ne trouve presque aucun fichier — la garde « aucune police fixe » " +
            "passerait au vert par omission (leçon 257)"
        )

        let offenders = files
            .filter { $0.stripped.contains(".font(.system(size:") }
            .map(\.relativePath)
            .sorted()
        XCTAssertTrue(
            offenders.isEmpty,
            "ces fichiers utilisent `.font(.system(size:` — interdit dans Focal/** (règle #9, §8) : " +
            offenders.joined(separator: ", ") + ". Utiliser MeeshyFont.relative(...)."
        )
    }

    // MARK: - 3. Un seul point de branchement invité (§5.1)

    /// RE-PREUVE de l'exclusion `Core/**` : le contrat (§5.1) nomme
    /// EXPLICITEMENT `ConversationCapabilitySet.resolve` — qui vit dans
    /// `Focal/Core/` — comme « l'UNIQUE point de branchement invité/inscrit
    /// de tout le chantier ». Ce point de branchement doit nécessairement
    /// lire `identity` (le type qu'il résout), et `ConversationViewerIdentity.isAnonymous`
    /// (la propriété elle-même) est DÉFINIE dans ce même dossier. Exclure
    /// `Core/**` de ce balayage n'affaiblit donc pas la garde : elle protège
    /// contre un SECOND point de branchement AILLEURS, pas contre le premier
    /// qui est le sujet même de la phrase contractuelle.
    func test_identityProbe_appearsNowhereOutsideCoreAndTheResolver() throws {
        let files = try swiftSources(excludingTopLevelDirectories: ["Core"])
            .filter { !$0.relativePath.hasSuffix("ConversationViewerIdentityResolver.swift") }
        XCTAssertGreaterThan(
            files.count, 15,
            "le balayage (hors Core/, hors le résolveur) ne trouve presque aucun fichier — " +
            "la garde d'identité passerait au vert par omission (leçon 257)"
        )

        let forbidden = ["anonymousSession", "isAnonymous", "authManager.currentUser"]
        var offenders: [String: [String]] = [:]
        for file in files {
            for needle in forbidden where file.stripped.contains(needle) {
                offenders[file.relativePath, default: []].append(needle)
            }
        }
        XCTAssertTrue(
            offenders.isEmpty,
            "ces fichiers testent un signal d'identité BRUT hors du résolveur WS-1 — " +
            "§5.1 : `ConversationViewerIdentityResolver.swift` (converti en `ConversationViewerIdentity`) " +
            "et `Focal/Core/` (le type + `ConversationCapabilitySet.resolve`, l'UNIQUE point de " +
            "branchement) sont les deux SEULS endroits autorisés : " +
            offenders.map { "\($0.key) [\($0.value.joined(separator: ", "))]" }
                .sorted().joined(separator: " ; ")
        )
    }

    // MARK: - 4. Zéro constante de loi hors Core/FocalPassConstants (garde R15)

    /// Même liste de littéraux que `scripts/check-law-literals.sh` (mission
    /// F-090 : « aligne sur check-law-literals.sh ») — HARD (bannis partout)
    /// et SOFT (bannis seulement en comparaison numérique, pour ne pas
    /// interdire un `fontSize: 25` légitime).
    private static let hardLawLiterals = ["520", "380", "160", "140", "45", "0.45", "0.82", "0.40", "0.35", "0.04", "900"]
    private static let softLawLiterals = ["25", "24", "10"]

    /// Recherche un JETON NUMÉRIQUE ISOLÉ, pas une sous-chaîne — même garde
    /// que `ScrollTimePillSourceGuardTests.containsStandaloneNumericLiteral`
    /// (`MeeshyColors.indigo900` contient "900" sans être le littéral de loi
    /// `900` : aucune frontière de mot entre "o" et "9"). C'est l'écart
    /// PRINCIPAL avec `check-law-literals.sh`, qui grep en sous-chaîne nue et
    /// se déclencherait donc à tort sur `indigo900` (RE-PREUVE de ce rapport,
    /// documentée dans le rapport F-090 — script non corrigé, hors
    /// propriété WS-11).
    private func containsStandaloneNumericLiteral(_ literal: String, in text: String) -> Bool {
        let pattern = "\\b\(NSRegularExpression.escapedPattern(for: literal))\\b"
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return false }
        return regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
    }

    private func containsComparisonToLiteral(_ literal: String, in text: String) -> Bool {
        let pattern = "(>|>=|<|<=)\\s*\(NSRegularExpression.escapedPattern(for: literal))\\b"
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return false }
        return regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
    }

    /// Sites RÉELS, DÉCOUVERTS par cette garde — F-083ter a corrigé les DEUX
    /// entrées historiques (consigne du lot : « constantes nommées,
    /// check-law-literals.sh doit rendre vert ») :
    /// - `Row/FocalMetaRow.swift` (`45`/`0.45`, `metaTint`) : régression de
    ///   CONTRASTE AA (2,85:1 clair, 4,49:1 sombre — `FocalPaletteContrastTests`,
    ///   F-090) autant qu'un littéral de loi. Lit désormais
    ///   `FocalMetrics.MetaText.lightOpacity`/`.darkOpacity` (`0.55`).
    /// - `Summary/EpisodeListView.swift` (`0.04`, fond de chip) : pas un
    ///   défaut de contraste, juste un littéral orphelin. Lit désormais
    ///   `FocalMetrics.SurfaceTint.lightFill`/`.darkFill`.
    ///
    /// L'allowlist est donc VIDE — plus AUCUN site connu ne dérobe un
    /// littéral de loi. `test_knownUnfixedLiteralSites_stillContainWhatTheyDocument`
    /// (ci-dessous) est vacuously vert (rien à itérer) ; il redeviendrait
    /// un signal utile si un futur défaut réel, délibérément non corrigé,
    /// avait besoin d'une entrée ici.
    private static let knownUnfixedLiteralSites: [String: Set<String>] = [:]

    func test_r15_noLawLiteralAnywhereInFocalOutsideCoreAndPassConstants() throws {
        let files = try swiftSources(
            excludingTopLevelDirectories: ["Core"],
            excludingRelativePaths: ["Scroll/FocalPassConstants.swift"]
        )
        XCTAssertGreaterThan(
            files.count, 15,
            "le balayage R15 (hors Core/, hors FocalPassConstants.swift) ne trouve presque aucun " +
            "fichier — la garde passerait au vert par omission (leçon 257)"
        )

        var offenders: [String: [String]] = [:]
        for file in files {
            var hits: [String] = []
            for literal in Self.hardLawLiterals where containsStandaloneNumericLiteral(literal, in: file.stripped) {
                if Self.knownUnfixedLiteralSites[file.relativePath]?.contains(literal) == true { continue }
                hits.append(literal)
            }
            for literal in Self.softLawLiterals where containsComparisonToLiteral(literal, in: file.stripped) {
                hits.append("comparaison à \(literal)")
            }
            if !hits.isEmpty { offenders[file.relativePath] = hits }
        }
        XCTAssertTrue(
            offenders.isEmpty,
            "ces fichiers de Focal/** portent un littéral de loi en dur (garde R15, alignée sur " +
            "scripts/check-law-literals.sh) — la constante doit venir de FocalFocusCurve/ScrollTimePillLaw " +
            "(Core/, GELÉS) ou de FocalPassConstants.swift (domicile documenté des cotes hors-token) : " +
            offenders.map { "\($0.key) [\($0.value.joined(separator: ", "))]" }
                .sorted().joined(separator: " ; ")
        )
    }

    /// L'allowlist elle-même ne doit pas pourrir en silence : si un site
    /// documenté cesse un jour de contenir son littéral (renommage, chiffre
    /// changé), l'entrée devient un faux négatif muet côté garde principale —
    /// ce test le détecte en le vérifiant indépendamment.
    func test_knownUnfixedLiteralSites_stillContainWhatTheyDocument() throws {
        let files = try swiftSources()
        let byPath = Dictionary(uniqueKeysWithValues: files.map { ($0.relativePath, $0.stripped) })
        for (path, literals) in Self.knownUnfixedLiteralSites {
            guard let code = byPath[path] else {
                XCTFail("l'allowlist R15 cite `\(path)`, introuvable sous Focal/** — entrée à retirer ou chemin à corriger")
                continue
            }
            for literal in literals {
                XCTAssertTrue(
                    containsStandaloneNumericLiteral(literal, in: code),
                    "l'allowlist R15 documente `\(literal)` dans `\(path)` mais ne l'y trouve plus — " +
                    "soit le défaut a été corrigé (retirer l'entrée), soit le fichier a changé de forme " +
                    "(ré-auditer le rapport F-090)"
                )
            }
        }
    }
}
