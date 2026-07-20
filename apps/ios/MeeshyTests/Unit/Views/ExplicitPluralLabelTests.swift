import XCTest
@testable import Meeshy

/// Régression du markup AGA inline (`^[…](inflect: true)`) : sans entrée
/// String Catalog, la résolution `String(localized:)` retombe sur
/// `defaultValue`, et ce chemin de repli ne résout PAS le markup au runtime
/// sur iOS 18.x — la chaîne brute fuirait dans l'UI visible ET dans VoiceOver.
/// Les labels comptés doivent donc résoudre le pluriel explicitement
/// (langue de dev = en). Même contrat que `PostStatAccessibilityTests`.
///
/// `@MainActor` : les types testés vivent dans le target app, isolé
/// main-actor-par-défaut (Swift 6.2).
@MainActor
final class ExplicitPluralLabelTests: XCTestCase {

    // MARK: - LoadMoreRepliesCell (texte visible + accessibilityLabel)

    func test_loadMoreRepliesLabelText_singularForOne() {
        XCTAssertEqual(LoadMoreRepliesCell.labelText(remaining: 1), "View 1 more reply")
    }

    func test_loadMoreRepliesLabelText_pluralForMany() {
        XCTAssertEqual(LoadMoreRepliesCell.labelText(remaining: 3), "View 3 more replies")
    }

    // MARK: - MessageViewsDetailView (compteur de tentatives d'envoi)

    func test_sendAttemptCountLabel_singularForOne() {
        XCTAssertEqual(MessageViewsDetailView.sendAttemptCountLabel(1), "1 attempt")
    }

    func test_sendAttemptCountLabel_pluralForMany() {
        XCTAssertEqual(MessageViewsDetailView.sendAttemptCountLabel(5), "5 attempts")
    }

    func test_sendAttemptCountLabel_pluralForZero() {
        XCTAssertEqual(MessageViewsDetailView.sendAttemptCountLabel(0), "0 attempts")
    }
}
