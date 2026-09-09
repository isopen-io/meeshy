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

    private func occurrences(of needle: String, in source: String) -> Int {
        source.components(separatedBy: needle).count - 1
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
        // Depuis #5837 la colonne droite monte `iPadRightPanel` (vue nominale,
        // iPadRootView+Panels.swift), qui porte le NavigationStack et rend
        // `iPadPanelDestination` — sortis du type de `iPadRootView.body`.
        let root = try source(of: "iPadRootView.swift")
        XCTAssertTrue(
            root.contains("iPadRightPanel("),
            "La colonne droite doit monter iPadRightPanel pour toute route hors conversation."
        )
        let panel = try source(of: "iPadRootView+Panels.swift")
        XCTAssertTrue(
            panel.contains("NavigationStack {"),
            "Le panneau droit iPad doit héberger un NavigationStack, sinon les NavigationLink de ses écrans sont inertes."
        )
        XCTAssertTrue(
            panel.contains("iPadPanelDestination("),
            "Le contenu du panneau doit rester rendu par iPadPanelDestination."
        )
    }

    func test_iPadRootView_exposesPanelDismissToItsScreens() throws {
        let code = try source(of: "iPadRootView+Panels.swift")
        XCTAssertTrue(
            code.contains("meeshyPanelDismiss"),
            "Sans meeshyPanelDismiss, le bouton retour des écrans racine du panneau n'a aucun effet."
        )
    }

    /// Le SyncPill iPad a migré vers un point de montage unique
    /// (`iPadRootView+Sheets.swift`, `.overlay` chaîné avant
    /// `.modifier(CallPresentationLayer())`) au lieu d'un montage par
    /// panneau — cf. docs/superpowers/specs/2026-08-11-global-chrome-banner-stacking-design.md.
    /// Cette garde vérifie que le tap route toujours vers `handleSyncPillTap`
    /// AU NOUVEL EMPLACEMENT, et que l'ancien montage par panneau n'est pas
    /// revenu par erreur.
    func test_iPadPanels_noLongerMountsConnectionBannerPerPanel() throws {
        let code = try source(of: "iPadRootView+Panels.swift")
        XCTAssertFalse(code.contains("ConnectionBanner("), "Le SyncPill ne doit plus être monté par panneau — un seul point de montage, iPadCoversAndChromeLayer (RootLayers/iPadRootViewLayers.swift)")
    }

    func test_iPadRootView_mountsConnectionBannerOnce_routingTapsToHandleSyncPillTap() throws {
        let layer = try source(of: "RootLayers/iPadRootViewLayers.swift")
        XCTAssertEqual(
            occurrences(of: "ConnectionBanner(", in: layer), 1,
            "RootLayers/iPadRootViewLayers.swift doit monter le SyncPill EXACTEMENT une fois — le point de montage est unique."
        )
        XCTAssertTrue(
            layer.contains("onItemTap: onSyncPillTap"),
            "Le point de montage unique route le tap vers la fermeture que la racine lui remet."
        )
        let root = try source(of: "iPadRootView.swift")
        XCTAssertTrue(
            root.contains("onSyncPillTap: handleSyncPillTap"),
            "La racine iPad doit remettre handleSyncPillTap à la couche, comme RootView (iPhone)."
        )
    }

    /// Les présentations déclenchées par les CARTES du feed (partage, citation,
    /// édition, commentaires de réel) ne doivent jamais être portées par
    /// `composerOverlay` : cette vue n'existe que composer ouvert, et un item
    /// armé sans vue hôte bloque ensuite toutes les présentations du feed.
    func test_feedView_postActionPresentations_areNotOwnedByComposerOverlay() throws {
        let code = try source(of: "FeedView.swift")
        // **L'ABSENCE de l'overlay SATISFAIT l'invariant** (réparé le
        // 2026-09-06). `composerOverlay` a été retiré de `FeedView` par
        // `4a50000317` — « 346 lignes qu'aucun appelant ne montait ». Le risque
        // que cette garde surveille — une présentation portée par une vue qui
        // n'existe que composer ouvert — devient alors structurellement
        // impossible : il n'y a plus de vue pour la porter.
        //
        // > **Une garde dont le sujet disparaît n'est pas fausse, elle est
        // > VACANTE.** La faire échouer punit le retrait qu'elle aurait dû
        // > applaudir ; la supprimer perdrait l'invariant le jour où un overlay
        // > revient. Elle constate donc l'absence et se rendort — prête à
        // > reprendre son office si le motif renaît.
        guard let overlayStart = code.range(of: "private var composerOverlay: some View") else {
            XCTAssertFalse(
                code.contains("composerOverlay"),
                "`composerOverlay` n'est plus déclaré mais reste RÉFÉRENCÉ : " +
                "une présentation pourrait encore lui être adossée sans hôte.")
            return
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
