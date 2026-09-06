import XCTest
@testable import Meeshy

/// **Toute racine qui instancie `UniversalComposerBar` doit câbler `onIngest`.**
///
/// Le rappel `onIngest` est la seule voie par laquelle le dépôt (Finder/Files)
/// et le collage d'une URL `file://` produisent une pièce jointe : sans lui,
/// `ComposerDropTargetModifier` résout bien le contenu mais l'appel
/// `onIngest?(ingests)` (`UniversalComposerBar+Drop.swift`) ne fait rien —
/// aucune tuile n'apparaît, sans le moindre signal d'erreur. Une racine qui
/// oublie ce câblage régresse silencieusement, dans l'esprit de
/// `QueueHandlerWiringParityTests` : le défaut est une ABSENCE, invisible à un
/// test de comportement qui ne peut pas observer un rappel qui n'a jamais lieu.
///
/// Lecture du code, pas des commentaires : les occurrences en commentaire de
/// doc (`` `onIngest` `` sans deux-points) ne comptent pas — seul un site
/// d'appel `onIngest:` suivi d'une fermeture (jamais `nil`) valide le câblage.
@MainActor
final class ComposerIngestWiringParityTests: XCTestCase {

    private func appSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// **Les hôtes se COMPTENT, ils ne se citent pas** (réparé le 2026-09-06).
    ///
    /// Cette liste était écrite à la main — six chemins, tenus à jour par
    /// quiconque déplaçait une barre. Le retrait de l'overlay inline
    /// (`4a50000317`) a sorti `UniversalComposerBar` de `FeedView.swift`, et la
    /// garde a continué d'EXIGER un câblage dans un fichier qui n'héberge plus
    /// rien : elle rougissait sur une conformité devenue sans objet.
    ///
    /// > **Un inventaire écrit à la main ne vieillit pas avec le code qu'il
    /// > décrit.** Il ne se trompe pas au moment où on l'écrit — il se trompe
    /// > le jour où quelqu'un déplace ce qu'il énumère, et c'est justement le
    /// > jour où personne ne pense à lui.
    ///
    /// L'inventaire est donc DÉRIVÉ : est hôte tout fichier qui instancie
    /// `UniversalComposerBar(`. Un hôte neuf est couvert sans qu'on y pense ;
    /// un hôte retiré cesse d'être exigé.
    private func hostsInstantiatingTheBar() throws -> [String] {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy")
        guard let parcours = FileManager.default.enumerator(
            at: racine, includingPropertiesForKeys: nil) else { return [] }
        var hotes: [String] = []
        for cas in parcours {
            guard let url = cas as? URL, url.pathExtension == "swift" else { continue }
            guard let code = try? String(contentsOf: url, encoding: .utf8),
                  code.contains("UniversalComposerBar(") else { continue }
            hotes.append(url.path)
        }
        return hotes.sorted()
    }

    func test_universalComposerBarHosts_allWireOnIngest() throws {
        let hotes = try hostsInstantiatingTheBar()
        // **Un balayage qui ne trouve rien passerait au VERT.** Le plancher est
        // le seul moyen de distinguer « tous les hôtes câblent » de « la
        // recherche s'est cassée » — deux verdicts identiques sans lui.
        XCTAssertGreaterThanOrEqual(
            hotes.count, 4,
            "aucun hôte trouvé : le balayage est cassé, pas le code")

        for host in hotes {
            let source = try String(contentsOf: URL(fileURLWithPath: host), encoding: .utf8)

            // Un site d'appel réel : `onIngest:` suivi d'une fermeture, pas
            // d'un `nil` littéral qui désactiverait le dépôt/collage.
            guard let range = source.range(of: "onIngest:") else {
                XCTFail("\(host) ne câble pas `onIngest` sur son UniversalComposerBar : " +
                         "le dépôt et le collage de fichier n'y produiront jamais de pièce jointe.")
                continue
            }

            let tail = source[range.upperBound...].prefix(80)
            XCTAssertFalse(
                tail.trimmingCharacters(in: .whitespacesAndNewlines).hasPrefix("nil"),
                "\(host) câble `onIngest` à `nil` : le dépôt et le collage de fichier y sont muets."
            )
        }
    }
}
