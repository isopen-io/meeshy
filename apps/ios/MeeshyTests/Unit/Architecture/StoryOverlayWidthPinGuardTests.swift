import XCTest
@testable import Meeshy

/// Garde d'analyse de source : tout calque flottant du lecteur de story doit
/// borner sa largeur au viewport réel.
///
/// Le canvas (`UIViewRepresentable`) gonfle la largeur intrinsèque du ZStack
/// qui l'héberge bien au-delà de l'écran — ~480 pt mesurés pour 402 pt de
/// viewport sur iPhone 16 Pro. Un calque qui se contente de `maxWidth:
/// .infinity` remplit donc ces 480 pt, se centre, et le `.clipped()` posé sur
/// l'ensemble lui rogne ~39 pt de CHAQUE côté.
///
/// La panne est silencieuse et déroutante : rien ne casse, rien n'échoue, le
/// contenu paraît simplement coupé aux deux bords — un titre amputé à gauche
/// pendant qu'un bouton disparaît à droite. Elle a déjà frappé deux fois : le
/// composer en 2026-06-03 (bouton d'envoi hors écran), puis la feuille des
/// langues en 2026-07-27. Le header, le rail latéral et le composer portent
/// tous le correctif ; c'est l'oubli sur un NOUVEAU calque que cette garde
/// intercepte.
final class StoryOverlayWidthPinGuardTests: XCTestCase {

    private func canvasSource() throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // …/Unit/Architecture
            .deletingLastPathComponent()  // …/Unit
            .deletingLastPathComponent()  // …/MeeshyTests
            .deletingLastPathComponent()  // …/apps/ios
            .deletingLastPathComponent()  // …/apps
            .deletingLastPathComponent()  // racine du dépôt
        let path = root.appendingPathComponent(
            "apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift")
        return try String(contentsOf: path, encoding: .utf8)
    }

    /// Retire les commentaires : plusieurs d'entre eux CITENT le motif
    /// recherché pour expliquer la règle, ce qui ferait passer la garde sur un
    /// calque qui ne l'applique pas. Délégué au stripper PARTAGÉ — l'ancienne
    /// coupe au premier `//` tronquait une ligne contenant une URL
    /// `https://…` et faisait disparaître le code inspecté.
    private func strippingComments(_ source: String) -> [String] {
        AppSourceGuard.strippedLines(source)
    }

    /// Un calque flottant se reconnaît à son `.zIndex(…)` : c'est ce qui le
    /// place au-dessus du canvas plutôt que dans le flux.
    private func layerMountings(in lines: [String]) -> [(view: String, line: Int, body: String)] {
        var found: [(String, Int, String)] = []
        for (index, line) in lines.enumerated() where line.contains(".zIndex(") {
            // Remonter jusqu'au constructeur du calque : une ligne dont le
            // premier mot est un type (majuscule) immédiatement suivi de `(`.
            var start = index
            var view: String?
            while start > 0, index - start < 60 {
                start -= 1
                let trimmed = lines[start].trimmingCharacters(in: .whitespaces)
                guard let first = trimmed.first, first.isUppercase,
                      let paren = trimmed.firstIndex(of: "("),
                      trimmed[trimmed.startIndex..<paren].allSatisfy({ $0.isLetter || $0.isNumber })
                else { continue }
                view = String(trimmed[trimmed.startIndex..<paren])
                break
            }
            if let view {
                found.append((view, start + 1, lines[start...index].joined(separator: "\n")))
            }
        }
        return found
    }

    func test_everyFloatingLayerBoundsItsWidthToTheViewport() throws {
        let lines = strippingComments(try canvasSource())
        let mountings = layerMountings(in: lines)

        XCTAssertFalse(mountings.isEmpty,
                       "aucun calque détecté — l'heuristique de détection a décroché du fichier")

        // Conforme = la largeur ne dépend PAS de la proposition du parent :
        // soit bornée au viewport, soit posée en dur (l'hôte de préchargement
        // invisible tient dans son 1×1 et ne peut rien déborder).
        let unpinned = mountings.filter { mounting in
            !mounting.body.contains("geometry.size.width")
                && !mounting.body.contains(".frame(width:")
        }

        XCTAssertTrue(unpinned.isEmpty, """
            Ces calques du lecteur de story ne bornent pas leur largeur au viewport :
            \(unpinned.map { "  • \($0.view) (ligne \($0.line))" }.joined(separator: "\n"))
            Le canvas gonfle le ZStack parent à ~480 pt pour 402 pt d'écran ; un calque
            non borné s'y étale et se fait rogner aux deux bords par le .clipped() final.
            Ajoutez `.frame(maxWidth: geometry.size.width)` au montage du calque.
            """)
    }
}
