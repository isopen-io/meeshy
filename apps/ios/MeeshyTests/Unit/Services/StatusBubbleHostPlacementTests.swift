import XCTest
@testable import Meeshy

/// Où `.withStatusBubble()` a le DROIT d'être posé.
///
/// Le mécanisme `shouldRenderOverlay` (cf. `StatusBubbleHostScopeTests`) ne
/// déduplique qu'entre ANCÊTRE et DESCENDANT — il est aveugle aux hôtes
/// FRÈRES. Poser le modificateur sur des vues sœurs (une carte de feed, les
/// deux colonnes iPad, un écran poussé) rendait une bulle PAR hôte, chacune
/// convertissant l'ancre globale dans son propre repère : deux bulles
/// décalées sur iPad, une bulle flottante par-dessus le feed et les
/// conversations (bug rapporté 2026-07-30).
///
/// Contrat : un hôte non modal UNIQUE par fenêtre (RootView, iPadRootView) ;
/// seules les PRÉSENTATIONS modales (sheet / fullScreenCover), qui vivent
/// dans leur propre UIHostingController où l'overlay racine est invisible,
/// posent le leur.
final class StatusBubbleHostPlacementTests: XCTestCase {

    private func viewsDir() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Services/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // apps/ios/
            .appendingPathComponent("Meeshy/Features/Main/Views")
    }

    /// Code source SANS les lignes de commentaire — une mention du modificateur
    /// dans une doc ne doit jamais satisfaire (ni faire échouer) le garde.
    private func strippedSource(of fileName: String) throws -> String {
        let url = viewsDir().appendingPathComponent(fileName)
        let raw = try String(contentsOf: url, encoding: .utf8)
        return raw
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }

    func test_windowRoots_hostTheBubble() throws {
        for root in ["RootView.swift", "iPadRootView.swift"] {
            let source = try strippedSource(of: root)
            XCTAssertTrue(
                source.contains(".withStatusBubble()"),
                "\(root) est l'hôte UNIQUE de la bulle pour sa fenêtre — sans lui, " +
                "plus aucune surface non modale n'affiche le mood."
            )
        }
    }

    func test_siblingProneSurfaces_doNotHostTheBubble() throws {
        // Chacune de ces surfaces coexiste avec des sœurs dans la même
        // fenêtre (cartes de feed, colonnes iPad, écrans du NavigationStack,
        // tray imbriqué) : un hôte ici ressuscite les bulles dupliquées.
        for surface in [
            "FeedPostCard.swift",
            "ConversationListView.swift",
            "StoryTrayView.swift",
            "ConversationView.swift",
            "FriendRequestListView.swift",
        ] {
            let source = try strippedSource(of: surface)
            XCTAssertFalse(
                source.contains(".withStatusBubble()"),
                "\(surface) ne doit pas héberger la bulle de mood : la racine de la " +
                "fenêtre s'en charge (une seule bulle, repère fenêtre)."
            )
        }
    }

    func test_conversationList_hasNoManualBubbleRender() throws {
        let source = try strippedSource(of: "ConversationListView.swift")
        XCTAssertFalse(
            source.contains("StatusBubbleOverlay("),
            "Le rendu manuel historique (showStatusBubble/@State) était mort — piloté " +
            "par un booléen jamais écrit — et masquait le fait que onRepublish n'était " +
            "câblé nulle part. Toute bulle passe par StatusBubbleController."
        )
    }

    func test_windowRoots_wireRepublishHandler() throws {
        for root in ["RootView.swift", "iPadRootView.swift"] {
            let source = try strippedSource(of: root)
            XCTAssertTrue(
                source.contains("StatusBubbleController.shared.onRepublish"),
                "\(root) doit câbler onRepublish : sans lui le bouton « Republier » de " +
                "la bulle est silencieusement absent (bug historique)."
            )
        }
    }
}
