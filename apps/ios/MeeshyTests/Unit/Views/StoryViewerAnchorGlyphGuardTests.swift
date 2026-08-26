import XCTest
@testable import Meeshy

/// Garde de NON-RÉGRESSION — deux glyphes DISTINCTS pour deux permanences
/// différentes (ligne V0 bis de la planche web, `KeepOnFeedIcon` dans
/// `apps/web/components/v2/StoryViewer.tsx`).
///
/// `StoryViewerView+Sidebar.swift` porte deux actions qui publient toutes les
/// deux, mais pas de la même façon : le bouton du rail (`showsRepost`) ouvre
/// le COMPOSEUR pour republier avec du texte ajouté — l'éphémère reste
/// éphémère, republié à côté. Le premier item du menu de partage
/// (`story.viewer.repostAsPost`, `repostAsPostDirect()`) republie EN UN TAP,
/// SANS composeur — c'est l'ANCRAGE web (`onRepostAsPost` / `KeepOnFeedIcon`,
/// aria-label « Keep on my feed ») : il rend la story permanente. Les deux
/// portaient `arrow.2.squarepath` avant ce correctif, un même dessin pour
/// deux permanences différentes.
///
/// `bookmark.fill` a d'abord repris le tracé web (un ruban de signet), mais
/// ce glyphe désigne DÉJÀ, ailleurs dans l'app, l'action produit « Publications
/// enregistrées » (SettingsView.swift:606, PostDetailView.swift:1130/:1820,
/// ReelsPlayerView.swift:1168, ReelFeedCard.swift:458) — collision levée DANS
/// ce fichier, rouverte à l'échelle de l'app (constat de revue
/// R3-bookmark-collision-produit, 2026-08-25). `pin.fill`/`archivebox.fill`
/// portent la même collision (épinglage, archivage). `infinity` (permanence :
/// story éphémère → post durable) reste libre de tout sens produit concurrent
/// dans l'app, vérifié par `test_anchor_neverReusesAProductGlyphOwnedElsewhere`.
///
/// **Pourquoi la fenêtre équilibrée, jamais le fichier entier.** Le fichier
/// porte DIX appels `StoryActionButton(` et de nombreux `label: {` — chercher
/// `"arrow.2.squarepath"` sur le texte entier ne dirait rien de QUEL bouton le
/// porte. Chaque garde isole donc la fenêtre équilibrée du bouton visé (par le
/// contenu qui l'identifie sans ambiguïté : la clé localisée), puis compare.
final class StoryViewerAnchorGlyphGuardTests: XCTestCase {

    private static let sidebarFile = "Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift"

    private func source() throws -> String {
        try MyStoriesSourceCorpus.text(of: Self.sidebarFile)
    }

    /// Fenêtre ÉQUILIBRÉE ouverte par `marker` : du marqueur jusqu'au
    /// délimiteur fermant qui lui correspond, sous-appels et closures compris.
    /// Le marqueur doit se terminer par son propre délimiteur ouvrant.
    private func balancedWindow(from marker: String, in text: String) -> [String] {
        var windows: [String] = []
        var searchStart = text.startIndex

        while let opening = text.range(of: marker, range: searchStart..<text.endIndex) {
            var depth = 1
            var insideString = false
            var previous: Character?
            var cursor = opening.upperBound

            while cursor < text.endIndex, depth > 0 {
                let character = text[cursor]
                if character == "\"" && previous != "\\" { insideString.toggle() }
                if !insideString {
                    if character == "(" || character == "[" || character == "{" { depth += 1 }
                    if character == ")" || character == "]" || character == "}" { depth -= 1 }
                }
                previous = character
                cursor = text.index(after: cursor)
            }

            if depth == 0 { windows.append(String(text[opening.lowerBound..<cursor])) }
            searchStart = opening.upperBound
        }
        return windows
    }

    /// Le bouton du RAIL (« republier » — ouvre le composeur), identifié par
    /// sa clé localisée `story.viewer.action.repost`.
    private func railRepostWindow() throws -> String {
        let windows = balancedWindow(from: "StoryActionButton(", in: try source())
        let matches = windows.filter { $0.contains("story.viewer.action.repost") }
        XCTAssertEqual(
            matches.count, 1,
            "Le bouton de republication du rail doit apparaître EXACTEMENT une fois " +
            "(clé « story.viewer.action.repost »). \(matches.count) trouvé(s) — le bouton a " +
            "été déplacé, dupliqué ou sa clé renommée."
        )
        guard let window = matches.first else {
            throw XCTSkip("Bouton de republication du rail introuvable — voir l'assertion ci-dessus.")
        }
        return window
    }

    /// L'ANCRAGE (« garder sur mon fil » — republication directe, un tap),
    /// identifié par sa clé localisée `story.viewer.repostAsPost`.
    private func anchorWindow() throws -> String {
        let windows = balancedWindow(from: "label: {", in: try source())
        let matches = windows.filter { $0.contains("story.viewer.repostAsPost") }
        XCTAssertEqual(
            matches.count, 1,
            "L'ancrage (republication directe) doit apparaître EXACTEMENT une fois " +
            "(clé « story.viewer.repostAsPost »). \(matches.count) trouvé(s) — le bouton a été " +
            "déplacé, dupliqué ou sa clé renommée."
        )
        guard let window = matches.first else {
            throw XCTSkip("Bouton d'ancrage introuvable — voir l'assertion ci-dessus.")
        }
        return window
    }

    // MARK: - Les deux glyphes DIFFÈRENT

    func test_railRepostAndAnchor_neverShareTheirGlyph() throws {
        let railWindow = try railRepostWindow()
        let anchorGlyphWindow = try anchorWindow()

        XCTAssertFalse(
            anchorGlyphWindow.contains("arrow.2.squarepath"),
            "L'ancrage (republication directe, « garder sur mon fil ») ne doit plus porter " +
            "arrow.2.squarepath — c'est le glyphe du bouton du rail (ouverture du composeur), " +
            "une permanence DIFFÉRENTE. Fenêtre :\n\(anchorGlyphWindow)"
        )
        XCTAssertTrue(
            railWindow.contains("arrow.2.squarepath"),
            "Le bouton du rail garde arrow.2.squarepath — ce correctif ne touche que l'ancrage. " +
            "Fenêtre :\n\(railWindow)"
        )
    }

    func test_anchor_wearsTheInfinityGlyph() throws {
        XCTAssertTrue(
            try anchorWindow().contains("systemImage: \"infinity\""),
            "L'ancrage doit porter infinity — permanence (story → post durable), sans reprendre " +
            "le dessin d'une action produit distincte."
        )
    }

    // MARK: - L'ancrage ne reprend AUCUN glyphe déjà porté par une action produit distincte
    // ailleurs dans l'app (constat de revue R3-bookmark-collision-produit, 2026-08-25) : deux
    // permanences différentes ne partagent pas un dessin, à l'échelle de l'APP, pas seulement
    // du fichier — `bookmark.fill` désigne déjà « Publications enregistrées »
    // (SettingsView.swift:606, PostDetailView.swift:1130/:1820, ReelsPlayerView.swift:1168,
    // ReelFeedCard.swift:458) ; `pin`/`pin.fill` désigne déjà « épingler »
    // (MessageActionsMenu.swift:103, FeedPostCard.swift:907, ConversationListView.swift:931) ;
    // `archivebox`/`archivebox.fill` désigne déjà « archiver »
    // (ConversationPreferencesTab.swift:358, ConversationListView.swift:971).

    func test_anchor_neverReusesAProductGlyphOwnedElsewhere() throws {
        let window = try anchorWindow()
        for reserved in ["bookmark", "pin", "archivebox"] {
            XCTAssertFalse(
                window.contains("systemImage: \"\(reserved)"),
                "L'ancrage ne doit pas porter un glyphe qui commence par « \(reserved) » — ce " +
                "dessin désigne déjà, ailleurs dans l'app, une action produit distincte (favoris, " +
                "épinglage ou archivage). Fenêtre :\n\(window)"
            )
        }
    }
}
