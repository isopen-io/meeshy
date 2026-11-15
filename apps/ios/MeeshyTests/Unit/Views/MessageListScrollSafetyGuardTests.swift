import XCTest
@testable import Meeshy

/// Défilements et éclairs de la liste de messages : ils visent un MESSAGE, et
/// ne questionnent jamais une section qui n'existe pas encore.
final class MessageListScrollSafetyGuardTests: XCTestCase {

    private func source() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(
            "Meeshy/Features/Main/Views/MessageListViewController+ScrollNavigation.swift"))
    }

    /// « Aller au dernier message » avant le premier instantané (fil en
    /// attente) : zéro section, et `numberOfItems(inSection: 0)` y est refusé.
    func test_scrollToBottom_checksTheSectionExistsFirst() throws {
        let code = try source()
        XCTAssertTrue(code.contains("guard collectionView.numberOfSections > 0, collectionView.numberOfItems(inSection: 0) > 0"))
    }

    /// Un message ou l'indicateur de frappe inséré en tête pendant les
    /// 250–350 ms du délai décalait les rangs : l'éclair tombait sur un autre.
    func test_flash_resolvesItsMessage_whenItFires() throws {
        let code = try source()
        let start = try XCTUnwrap(code.range(of: "private func legacyFlashCell("))
        let body = String(code[start.upperBound...].prefix(1400))
        XCTAssertTrue(body.contains("itemIdentifier(for: indexPath)"))
        XCTAssertTrue(body.contains("self.dataSource?.indexPath(for:"))
    }

    /// Toute question à la section 0 est précédée de « la section existe » :
    /// l'instantané peut devancer ce que la collection a ingéré.
    func test_everySectionZeroQuery_isGuardedBySectionCount() throws {
        for path in [
            "Meeshy/Features/Main/Views/MessageListViewController.swift",
            "Meeshy/Features/Main/Views/MessageListViewController+UnreadSeparator.swift",
            "Meeshy/Features/Main/Views/MessageListViewController+ScrollNavigation.swift",
        ] {
            let code = AppSourceGuard.stripComments(try String(contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
                .appendingPathComponent(path), encoding: .utf8))
            let queries = code.components(separatedBy: "numberOfItems(inSection: 0)").count - 1
            let guards = code.components(separatedBy: "numberOfSections > 0").count - 1
            XCTAssertGreaterThanOrEqual(guards, queries, path)
        }
    }

    /// La re-visée de fin de passe (`.correct`) appelait `scrollToItem` sur un
    /// index tiré de l'INSTANTANÉ, sans la garde « déjà ingéré » que portent
    /// `beginVerifiedScroll` et le séparateur de non-lus : une fenêtre appliquée
    /// pendant l'animation faisait lever `NSInternalInconsistencyException`.
    func test_settleReaim_checksTheItemIsIngestedBeforeScrolling() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.unit(
            "Meeshy/Features/Main/Views/MessageListViewController+ScrollSettle.swift"))
        let start = try XCTUnwrap(code.range(of: "func verifyScrollSettleTarget()"))
        let scroll = try XCTUnwrap(code.range(of: "collectionView.scrollToItem(", range: start.upperBound..<code.endIndex))
        let before = String(code[start.upperBound..<scroll.lowerBound])
        XCTAssertTrue(before.contains("indexPath.item < collectionView.numberOfItems(inSection: 0)"))
        XCTAssertTrue(before.contains("collectionView.numberOfSections > 0"))
    }
}
