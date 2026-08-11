import XCTest
@testable import Meeshy

/// Gardes de source sur le panneau droit iPad.
///
/// Deux régressions vécues (2026-07-29, audit navigation iPad) :
///   1. `rightPanelContent` posé SANS `NavigationStack` → tout `NavigationLink`
///      d'un écran du panneau (lignes de TrackingLinksView / ShareLinksView /
///      CommunityLinksView vers leur détail) était inerte au tap.
///   2. `ConnectionBanner()` construit sans `onItemTap` → taper une entrée de la
///      pastille de synchronisation n'ouvrait ni la conversation ni le post,
///      alors que l'iPhone route via `handleSyncPillTap`.
///
/// Les deux échouent en silence à l'exécution : rien ne se passe, aucun log,
/// aucun crash. D'où ces gardes.
final class iPadRightPanelNavigationGuardTests: XCTestCase {

    // MARK: - Helpers

    /// Retire commentaires de ligne ET de bloc — y compris un bloc ouvert et
    /// refermé sur la même ligne (`} catch { /* … */ }`, présent dans FeedView) :
    /// une première version ligne-à-ligne prenait ce cas pour un bloc ouvert et
    /// avalait tout le reste du fichier, rendant la garde verte à tort.
    /// Sans ce nettoyage, un commentaire citant le motif recherché suffirait
    /// à faire passer (ou échouer) la garde.
    private func strippingComments(_ source: String) -> String {
        var result = ""
        var index = source.startIndex
        var inBlock = false
        var inLine = false

        while index < source.endIndex {
            let remainder = source[index...]
            if inBlock {
                if remainder.hasPrefix("*/") {
                    inBlock = false
                    index = source.index(index, offsetBy: 2)
                    continue
                }
                if source[index] == "\n" { result.append("\n") }
                index = source.index(after: index)
                continue
            }
            if inLine {
                if source[index] == "\n" {
                    inLine = false
                    result.append("\n")
                }
                index = source.index(after: index)
                continue
            }
            if remainder.hasPrefix("/*") {
                inBlock = true
                index = source.index(index, offsetBy: 2)
                continue
            }
            if remainder.hasPrefix("//") {
                inLine = true
                index = source.index(index, offsetBy: 2)
                continue
            }
            result.append(source[index])
            index = source.index(after: index)
        }
        return result
    }

    private func source(of fileName: String, file: StaticString = #filePath, line: UInt = #line) throws -> String {
        // #filePath → .../apps/ios/MeeshyTests/Unit/Views/<ce fichier>
        let appRoot = URL(fileURLWithPath: "\(#filePath)")
            .deletingLastPathComponent()   // Views
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Views")
            .appendingPathComponent(fileName)
        let raw = try String(contentsOf: appRoot, encoding: .utf8)
        return strippingComments(raw)
    }

    // MARK: - Guards

    func test_iPadRootView_rightPanel_isWrappedInNavigationStack() throws {
        let code = try source(of: "iPadRootView.swift")
        XCTAssertTrue(
            code.contains("NavigationStack {"),
            "Le panneau droit iPad doit héberger un NavigationStack, sinon les NavigationLink de ses écrans sont inertes."
        )
        XCTAssertTrue(
            code.contains("rightPanelContent(for: route)"),
            "Le contenu du panneau doit rester rendu par rightPanelContent(for:)."
        )
    }

    func test_iPadRootView_exposesPanelDismissToItsScreens() throws {
        let code = try source(of: "iPadRootView.swift")
        XCTAssertTrue(
            code.contains("meeshyPanelDismiss"),
            "Sans meeshyPanelDismiss, le bouton retour des écrans racine du panneau n'a aucun effet."
        )
    }

    /// Ancrée sur le CÂBLAGE (`onItemTap:` présent), pas sur la signature
    /// complète : la bannière a depuis gagné `activeConversationId:`, puis
    /// `conversationListViewModel:`/`isStoryViewerPresenting:` en tête de
    /// signature (Task 3 — injection explicite) ; une garde qui exigeait
    /// `onItemTap:` immédiatement après la parenthèse ouvrante serait
    /// devenue rouge sur un changement sans rapport avec ce qu'elle protège.
    func test_iPadPanels_connectionBanner_alwaysRoutesTaps() throws {
        let code = try source(of: "iPadRootView+Panels.swift")
        XCTAssertFalse(
            code.contains("ConnectionBanner()"),
            "ConnectionBanner sans onItemTap rend les entrées de la pastille de sync non navigables sur iPad."
        )
        XCTAssertTrue(
            code.contains("onItemTap: handleSyncPillTap"),
            "Les bannières du panneau iPad doivent router le tap comme RootView (iPhone)."
        )
    }

    /// Les présentations déclenchées par les CARTES du feed (partage, citation,
    /// édition, commentaires de réel) ne doivent jamais être portées par
    /// `composerOverlay` : cette vue n'existe que composer ouvert, et un item
    /// armé sans vue hôte bloque ensuite toutes les présentations du feed.
    func test_feedView_postActionPresentations_areNotOwnedByComposerOverlay() throws {
        let code = try source(of: "FeedView.swift")
        guard let overlayStart = code.range(of: "private var composerOverlay: some View") else {
            return XCTFail("composerOverlay introuvable — garde à réaligner sur la nouvelle structure.")
        }
        // Borne la portée à la déclaration suivante : sinon la garde lit tout le
        // reste du fichier — y compris les présentations correctement remontées
        // au body — et échoue alors même que le correctif est en place.
        let afterOverlay = code[overlayStart.upperBound...]
        let overlayEnd = afterOverlay.range(of: "\n    private ")?.lowerBound
            ?? afterOverlay.range(of: "\n    // MARK:")?.lowerBound
            ?? afterOverlay.endIndex
        let overlayScope = afterOverlay[..<overlayEnd]
        for item in ["$shareableLink", "$quoteTargetPost", "$editingPost", "$reelCommentsPost"] {
            XCTAssertFalse(
                overlayScope.contains(".sheet(item: \(item)") || overlayScope.contains(".fullScreenCover(item: \(item)"),
                "\(item) doit être présenté depuis le body de FeedView, pas depuis composerOverlay (monté sous `if showComposer`)."
            )
        }
        XCTAssertTrue(
            code.contains("postActionPresentations("),
            "Les présentations d'action de post doivent passer par postActionPresentations(_:) ancré au body."
        )
    }
}
