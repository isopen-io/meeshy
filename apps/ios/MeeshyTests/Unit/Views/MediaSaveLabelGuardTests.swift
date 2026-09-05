import XCTest
@testable import Meeshy

final class MediaSaveLabelGuardTests: XCTestCase {
    private func sourceWithoutComments(_ path: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent(path)
        let raw = try String(contentsOf: url, encoding: .utf8)
        return raw
            .replacingOccurrences(of: #"//[^\n]*"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"/\*[\s\S]*?\*/"#, with: "", options: .regularExpression)
    }

    func test_reelFeedCard_saveMediaMenuItem_usesSauvegarderLabel() throws {
        let source = try sourceWithoutComments("Meeshy/Features/Main/Views/ReelFeedCard.swift")
        XCTAssertTrue(source.contains(#"String(localized: "feed.reel.save_media", defaultValue: "Sauvegarder", bundle: .main)"#),
            "Le téléchargement média du menu « … » de ReelFeedCard doit afficher « Sauvegarder », distinct du bookmark « Enregistrer »")
        XCTAssertTrue(source.contains(#"String(localized: "feed.post.save", defaultValue: "Enregistrer", bundle: .main)"#),
            "Le bouton bookmark dédié de la rail (actionsRow) doit rester « Enregistrer »")
    }

    func test_reelsPlayerView_saveMediaMenuItem_usesSauvegarderLabel() throws {
        let source = try sourceWithoutComments("Meeshy/Features/Main/Views/ReelsPlayerView.swift")
        XCTAssertTrue(source.contains(#"String(localized: "feed.reel.save_media", defaultValue: "Sauvegarder", bundle: .main)"#),
            "Le téléchargement média du menu « … » du lecteur plein écran doit afficher « Sauvegarder »")
        XCTAssertTrue(source.contains(#"String(localized: "reels.action.bookmark", defaultValue: "Enregistrer", bundle: .main)"#),
            "Le bouton bookmark dédié de la rail (ReelActionRail) doit rester « Enregistrer »")
    }

    func test_feedPostCard_saveMenuItem_usesDynamicLabelByMediaPresence() throws {
        // #4078 — le menu « … » a suivi la rangée auteur dans l'extension ; le
        // bouton bookmark dédié de `actionsBar` est resté chez l'hôte. Les deux
        // moitiés sont donc lues ENSEMBLE : sur un seul fichier, la garde
        // n'aurait plus vu qu'une des deux étiquettes qu'elle oppose.
        let source = try sourceWithoutComments("Meeshy/Features/Main/Views/FeedPostCard.swift")
            + sourceWithoutComments("Meeshy/Features/Main/Views/FeedPostCard+Header.swift")
        XCTAssertTrue(source.contains(#"post.primaryReelDisplayMedia != nil"#),
            "La branche média du menu « … » de FeedPostCard doit rester conditionnée sur primaryReelDisplayMedia")
        XCTAssertTrue(source.contains(#"String(localized: "feed.reel.save_media", defaultValue: "Sauvegarder", bundle: .main)"#),
            "Quand la branche média est active, le menu « … » de FeedPostCard doit afficher « Sauvegarder »")
        XCTAssertTrue(source.contains(#"String(localized: "feed.post.save", defaultValue: "Enregistrer", bundle: .main)"#),
            "La branche bookmark du menu ET le bouton dédié actionsBar doivent rester « Enregistrer »")
    }

    func test_postDetailView_saveMenuItem_usesDynamicLabelByMediaPresence() throws {
        let source = try sourceWithoutComments("Meeshy/Features/Main/Views/PostDetailView.swift")
        XCTAssertTrue(source.contains(#"displayPost?.primaryReelDisplayMedia != nil"#),
            "La branche média du menu « … » de PostDetailView doit rester conditionnée sur primaryReelDisplayMedia")
        XCTAssertTrue(source.contains(#"String(localized: "feed.reel.save_media", defaultValue: "Sauvegarder", bundle: .main)"#),
            "Quand la branche média est active, le menu « … » de PostDetailView doit afficher « Sauvegarder »")
        XCTAssertTrue(source.contains(#"String(localized: "a11y.post.bookmark_add", defaultValue: "Ajouter aux favoris", bundle: .main)"#),
            "Le bouton bookmark dédié de la barre d'action (hors menu), sur ses propres clés a11y.post.bookmark_*, ne doit pas être touché")
    }
}
