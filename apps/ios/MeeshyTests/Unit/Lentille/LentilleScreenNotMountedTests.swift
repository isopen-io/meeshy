import XCTest
@testable import Meeshy

/// Témoin de structure — Q-144 / R20 : l'écran Lentille n'existe pas drapeau OFF.
/// Aucune vue Lentille, aucun composant Lentille ne doit être monté en dehors de
/// `Features/Main/Lentille/` quand `LentilleFeatureFlag.isLentilleListEnabled` est OFF.
///
/// **Position A — le MENU ne donne accès à Lentille en dur (inchangé).**
/// `LentilleModeMenuModel.build` dérive `isDisabled` pour les modes non disponibles
/// (`capabilities.availableModes.contains(mode)`) : le drapeau contrôle donc
/// l'éligibilité, pas un hardcode. Voir `ModeMenuModelTests` pour le comportement
/// complet (grisée drapeau OFF, dégrisée drapeau ON + éligible).
///
/// **Position B — l'ÉCRAN reste NON MONTÉ hors du drapeau.** `LentilleFlatRow` et
/// ses compagnons (`LentilleSticker`, `LentilleBridgeLine`, `LentilleSkeletonRow`,
/// `SectionScrollPill`, etc.) n'ont qu'UN site de greffe hors de `Lentille/` :
/// `ConversationListView`, et chaque montage y est sous
/// `LentilleFeatureFlag.isLentilleListEnabled`.
///
/// La garde a longtemps interdit toute RÉFÉRENCE hors `Lentille/`, ce que cette
/// même en-tête contredisait déjà en nommant `ConversationListView` comme le
/// point de greffe légitime. Elle est devenue rouge quand les montages y ont été
/// écrits en clair (R-a, 2026-08-16) — sans qu'aucune règle produit ne soit
/// violée. Une garde qui rougit sur son propre cas nominal n'apprend plus rien :
/// ce qui compte n'est pas l'absence du nom, c'est que le montage soit GARDÉ.
///
/// Deux des quatre échecs portaient de surcroît sur des COMMENTAIRES — la garde
/// ne les dépouillait pas, alors que `AppSourceGuard.stripComments` existe pour
/// ça et que les autres gardes de source du dépôt l'utilisent.
///
/// Ce témoin verrouille les DEUX positions : si un futur lot monte effectivement
/// la peau Lentille en dehors de son dossier ET/OU change le code hors-Lentille
/// pour référencer les composants Lentille, il doit AUSSI mettre à jour/retirer
/// la partie concernée de cette suite — jamais la laisser rougir en silence.
final class LentilleScreenNotMountedTests: XCTestCase {

    private static var meeshyRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Lentille
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy")
    }

    /// Le SEUL fichier hors `Lentille/` autorisé à monter la peau — et
    /// seulement sous le drapeau, ce que `test_leSiteDeGreffe_estGardéParLeDrapeau`
    /// vérifie. Tout autre fichier qui apparaîtrait ici doit être un choix
    /// délibéré, documenté, jamais un glissement.
    private static let graftSite = "ConversationListView.swift"

    /// Tout `.swift` sous `Meeshy/`, HORS `Features/Main/Lentille/` — découvert,
    /// jamais recopié.
    private func nonLentilleSwiftFiles() throws -> [URL] {
        var results: [URL] = []
        let lentilleRoot = Self.meeshyRoot.appendingPathComponent("Features/Main/Lentille")
        guard let enumerator = FileManager.default.enumerator(
            at: Self.meeshyRoot,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        ) else {
            XCTFail("Impossible d'énumérer \(Self.meeshyRoot.path)")
            return []
        }
        for case let url as URL in enumerator {
            if url.path.hasPrefix(lentilleRoot.path) {
                enumerator.skipDescendants()
                continue
            }
            if url.pathExtension == "swift" {
                results.append(url)
            }
        }
        return results
    }

    func test_guardDiscoversFiles_neverSilentlyEmpty() throws {
        let files = try nonLentilleSwiftFiles()
        XCTAssertFalse(files.isEmpty, "Aucun fichier .swift découvert hors Lentille/ — vérifier le chemin de scan.")
    }

    /// `LentilleFlatRow` — le composant principal de la peau Lentille —
    /// n'apparaît NULLE PART hors de `Lentille/` : aucun call site ne le monte.
    func test_lentilleFlatRow_isReferencedNowhereOutsideLentille() throws {
        for url in try nonLentilleSwiftFiles() where url.lastPathComponent != Self.graftSite {
            guard let raw = try? String(contentsOf: url, encoding: .utf8) else { continue }
            let code = AppSourceGuard.stripComments(raw)
            XCTAssertFalse(
                code.contains("LentilleFlatRow"),
                "\(url.lastPathComponent) référence `LentilleFlatRow` — la peau Lentille ne doit " +
                "être montée nulle part drapeau OFF (Q-144 demande que le drapeau isLentilleListEnabled " +
                "soit le seul point de contrôle du montage). Si ce fichier est le nouveau site de montage " +
                "légitime, mettre à jour ce témoin en le documentant plutôt que de le supprimer."
            )
        }
    }

    /// Idem pour les composants de chrome de Lentille : `LentilleSticker`,
    /// `SectionScrollPill`, `StoriesVivantsRail` — jamais appelés depuis le code
    /// non-Lentille.
    func test_lentilleChromeComponents_areReferencedNowhereOutsideLentille() throws {
        let chromeComponents = ["LentilleSticker", "SectionScrollPill", "StoriesVivantsRail"]
        for url in try nonLentilleSwiftFiles() where url.lastPathComponent != Self.graftSite {
            guard let raw = try? String(contentsOf: url, encoding: .utf8) else { continue }
            let code = AppSourceGuard.stripComments(raw)
            for component in chromeComponents {
                XCTAssertFalse(
                    code.contains(component),
                    "\(url.lastPathComponent) référence `\(component)` — la peau Lentille ne doit " +
                    "être montée nulle part drapeau OFF (Q-144). Ce témoin fige la frontière du drapeau."
                )
            }
        }
    }

    /// `ConversationListView` est la SEULE exception admise — et l'exception
    /// porte sur la RÉFÉRENCE, pas sur le montage : chaque composant Lentille
    /// y est construit à l'intérieur d'un bloc
    /// `LentilleFeatureFlag.isLentilleListEnabled`. Drapeau OFF, aucun n'existe.
    ///
    /// Ce témoin se contentait d'exiger que la chaîne du drapeau apparaisse
    /// QUELQUE PART dans le fichier. Un montage sorti de son bloc l'aurait
    /// laissé vert — c'est-à-dire précisément la régression qu'il nomme. Il
    /// raisonne désormais par CONTENANCE d'accolades ; pas par proximité de
    /// lignes non plus, une fenêtre de N lignes pourrissant dès qu'on insère du
    /// code au-dessus.
    ///
    /// Le discriminant d'un MONTAGE est le symbole suivi d'une parenthèse
    /// ouvrante. `LentilleSticker.displayTitle(…)` — fonction pure de libellé,
    /// partagée avec la pilule de section pour que les deux crient le même mot —
    /// n'est pas un montage et n'a donc pas à vivre sous le drapeau.
    func test_conversationListView_allLentilleReferencesAreGuarded() throws {
        let clvPath = Self.meeshyRoot
            .appendingPathComponent("Features/Main/Views")
            .appendingPathComponent(Self.graftSite)
        guard let raw = try? String(contentsOf: clvPath, encoding: .utf8) else {
            XCTFail("Impossible de lire \(clvPath.path)")
            return
        }
        let code = AppSourceGuard.stripComments(raw)

        let guardedRanges = Self.flagGuardedRanges(in: code)
        XCTAssertFalse(
            guardedRanges.isEmpty,
            "Aucun bloc `LentilleFeatureFlag.isLentilleListEnabled` trouvé dans " +
            "\(Self.graftSite) — le balayage ne voit plus le code, ou le drapeau a disparu."
        )

        var offenders: [String] = []
        for mount in ["LentilleFlatRow(", "LentilleSticker(", "StoriesVivantsRail(", "SectionScrollPillHost("] {
            var searchStart = code.startIndex
            while let found = code.range(of: mount, range: searchStart..<code.endIndex) {
                let offset = code.distance(from: code.startIndex, to: found.lowerBound)
                if !guardedRanges.contains(where: { $0.contains(offset) }) {
                    offenders.append("\(mount) hors bloc (offset \(offset))")
                }
                searchStart = found.upperBound
            }
        }

        XCTAssertTrue(
            offenders.isEmpty,
            """
            Montage de la peau Lentille HORS d'un bloc \
            `LentilleFeatureFlag.isLentilleListEnabled` dans \(Self.graftSite) — \
            drapeau OFF, ces composants seraient construits (Q-144 / R20) :
            \(offenders.joined(separator: "\n"))
            """
        )
    }

    /// Intervalles d'offsets couverts par un bloc ouvert après une mention du
    /// drapeau.
    ///
    /// Pour chaque occurrence on prend la PREMIÈRE accolade ouvrante qui suit,
    /// puis on avance jusqu'à sa fermante en comptant les niveaux. Les usages en
    /// EXPRESSION (`… ? a : b`, `let x = …`) n'ouvrent pas de bloc immédiat :
    /// l'accolade trouvée appartient alors à la construction suivante, et
    /// l'intervalle produit ne contient aucun montage. Ils ne peuvent donc pas
    /// blanchir un montage — seulement ne rien couvrir.
    private static func flagGuardedRanges(in code: String) -> [Range<Int>] {
        let chars = Array(code)
        let needle = Array("LentilleFeatureFlag.isLentilleListEnabled")
        var ranges: [Range<Int>] = []
        var i = 0
        while i + needle.count <= chars.count {
            guard Array(chars[i..<(i + needle.count)]) == needle else {
                i += 1
                continue
            }
            var j = i + needle.count
            while j < chars.count, chars[j] != "{" { j += 1 }
            guard j < chars.count else { break }
            var depth = 0
            var k = j
            while k < chars.count {
                if chars[k] == "{" { depth += 1 }
                if chars[k] == "}" {
                    depth -= 1
                    if depth == 0 { break }
                }
                k += 1
            }
            if k < chars.count { ranges.append(j..<k) }
            i += needle.count
        }
        return ranges
    }
}
