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

    /// Les six hôtes qui présentent `UniversalComposerBar`, listés par la
    /// spec du 2026-07-30 : conversations, post, deux surfaces de
    /// commentaires, et réponse à une story.
    private static let hosts = [
        "Meeshy/Features/Main/Views/ConversationView+Composer.swift",
        "Meeshy/Features/Main/Views/FeedView.swift",
        "Meeshy/Features/Main/Views/FeedView+Attachments.swift",
        "Meeshy/Features/Main/Views/PostDetailView.swift",
        "Meeshy/Features/Main/Views/FeedCommentsSheet.swift",
        // 2026-09-02 — `StoryComposerBarView` a quitté `StoryViewerView+Canvas.swift`
        // (dette de taille) pour son propre fichier ; l'hôte suit le SITE qui
        // instancie `UniversalComposerBar`, pas le nom historique du fichier.
        "Meeshy/Features/Main/Views/StoryViewerView+CanvasComposerBar.swift",
    ]

    func test_universalComposerBarHosts_allWireOnIngest() throws {
        for host in Self.hosts {
            let source = try appSource(host)

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
