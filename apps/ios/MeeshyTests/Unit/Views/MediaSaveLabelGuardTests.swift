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
        let source = try sourceWithoutComments("Meeshy/Features/Main/Views/FeedPostCard.swift")
        XCTAssertTrue(source.contains(#"post.primaryReelDisplayMedia != nil"#),
            "La branche média du menu « … » de FeedPostCard doit rester conditionnée sur primaryReelDisplayMedia")
        XCTAssertTrue(source.contains(#"String(localized: "feed.reel.save_media", defaultValue: "Sauvegarder", bundle: .main)"#),
            "Quand la branche média est active, le menu « … » de FeedPostCard doit afficher « Sauvegarder »")
        XCTAssertTrue(source.contains(#"String(localized: "feed.post.save", defaultValue: "Enregistrer", bundle: .main)"#),
            "La branche bookmark du menu ET le bouton dédié actionsBar doivent rester « Enregistrer »")
    }
}
