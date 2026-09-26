import XCTest
@testable import Meeshy

/// #8147 — un message long se déplie EN PLACE dans le fil, un seul à la fois,
/// sans saut de défilement, et reçoit l'effet Focal tant qu'il est déplié et
/// visible. La feuille « Lire plus » n'existe plus.
final class LongMessageExpansionTests: XCTestCase {

    // MARK: - Un seul déplié à la fois

    func test_nextExpanded_nothingExpanded_expandsTheTouchedMessage() {
        XCTAssertEqual(LongMessageExpansionLaw.nextExpanded(current: nil, toggled: "a"), "a")
    }

    func test_nextExpanded_touchingTheExpandedMessage_collapsesIt() {
        XCTAssertNil(LongMessageExpansionLaw.nextExpanded(current: "a", toggled: "a"))
    }

    func test_nextExpanded_touchingAnotherMessage_replacesTheExpandedOne() {
        XCTAssertEqual(LongMessageExpansionLaw.nextExpanded(current: "a", toggled: "b"), "b")
    }

    // MARK: - Aucun saut de défilement

    func test_anchor_expanding_holdsTheTopEdge_collapsing_holdsTheBottomEdge() {
        XCTAssertEqual(LongMessageExpansionLaw.anchor(isExpanding: true), .top)
        XCTAssertEqual(LongMessageExpansionLaw.anchor(isExpanding: false), .bottom)
    }

    func test_anchoredOffset_edgeMovedUp_scrollsByTheSameAmount_soTheEdgeStaysStill() {
        let offset = LongMessageExpansionLaw.anchoredOffset(
            current: 100, edgeBefore: 300, edgeAfter: 180, minOffset: -50, maxOffset: 5_000
        )
        XCTAssertEqual(offset, 220)
    }

    func test_anchoredOffset_edgeUnmoved_keepsTheOffset() {
        let offset = LongMessageExpansionLaw.anchoredOffset(
            current: 100, edgeBefore: 300, edgeAfter: 300, minOffset: -50, maxOffset: 5_000
        )
        XCTAssertEqual(offset, 100)
    }

    func test_anchoredOffset_isBoundedByTheScrollableRange() {
        XCTAssertEqual(
            LongMessageExpansionLaw.anchoredOffset(current: 0, edgeBefore: 100, edgeAfter: 400, minOffset: -50, maxOffset: 5_000),
            -50
        )
        XCTAssertEqual(
            LongMessageExpansionLaw.anchoredOffset(current: 4_900, edgeBefore: 400, edgeAfter: 100, minOffset: -50, maxOffset: 5_000),
            5_000
        )
    }

    // MARK: - L'effet Focal du déplié

    func test_alpha_expandedVisible_dimsTheNeighbours_only() {
        XCTAssertEqual(LongMessageExpansionLaw.alpha(isExpandedCell: true, expansionVisible: true), 1)
        XCTAssertEqual(
            LongMessageExpansionLaw.alpha(isExpandedCell: false, expansionVisible: true),
            FocalScrollPerspective.alphaFloor
        )
        XCTAssertLessThan(FocalScrollPerspective.alphaFloor, 1)
    }

    func test_alpha_expandedOffScreen_leavesTheThreadUniform() {
        XCTAssertEqual(LongMessageExpansionLaw.alpha(isExpandedCell: false, expansionVisible: false), 1)
    }

    func test_loupe_underReduceMotion_neverScales() {
        let size = CGSize(width: 300, height: 400)
        XCTAssertEqual(FocalScrollPerspective.loupeScale(isFocused: true, reduceMotion: true, size: size), 1)
        XCTAssertGreaterThan(FocalScrollPerspective.loupeScale(isFocused: true, reduceMotion: false, size: size), 1)
    }

    // MARK: - La feuille de lecture est SUPPRIMÉE (garde de non-retour)

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private func source(_ relativePath: String) throws -> String {
        let raw = try String(contentsOf: Self.iosRoot.appendingPathComponent(relativePath), encoding: .utf8)
        return AppSourceGuard.stripComments(raw)
    }

    func test_theReadMoreSheet_isGone_andNothingPresentsItAgain() throws {
        let sheetPath = Self.iosRoot.appendingPathComponent("Meeshy/Features/Main/Focal/Lens/FocalReadMoreSheet.swift").path
        XCTAssertFalse(FileManager.default.fileExists(atPath: sheetPath), "la feuille « Lire plus » est supprimée (#8147)")
        let chain = [
            "Meeshy/Features/Main/Views/ConversationView.swift",
            "Meeshy/Features/Main/Views/MessageListView.swift",
            "Meeshy/Features/Main/Views/MessageListViewController.swift",
            "Meeshy/Features/Main/Focal/Core/FocalRowInput.swift",
            "Meeshy/Features/Main/Focal/Row/FocalRow.swift",
        ]
        for path in chain {
            let code = try source(path)
            XCTAssertFalse(code.contains("ReadMorePayload"), "\(path) : plus de charge de feuille de lecture")
            XCTAssertFalse(code.contains("onReadMore"), "\(path) : plus de chaîne vers une feuille — le dépliage se fait en place")
        }
    }

    func test_everyReadingMode_mountsTheInPlaceExpansion() throws {
        let row = try source("Meeshy/Features/Main/Focal/Row/FocalRow.swift")
        XCTAssertTrue(row.contains("expansion: expansion"), "Script/Focal : la rangée plate déplie en place")
        let host = try source("Meeshy/Features/Main/Views/MessageListViewController.swift")
        XCTAssertTrue(host.contains("messageBubble.longMessageFocus(self.longMessageExpansion(for: localId), accentHex: accent)"), "Bulles : la bulle reçoit l'état de l'hôte")
        XCTAssertTrue(host.contains("focalActions.onToggleExpanded"), "Script/Focal : la rangée remonte le geste à l'hôte")
        let river = try source("Meeshy/Features/Main/Riviere/View/RiverStreamHost.swift")
        XCTAssertTrue(river.contains(".longMessageFocus(expansion(for: bubble.messageId)"), "Rivière : même dépliage, même effet")
        let riverBubble = try source("Meeshy/Features/Main/Riviere/View/RiverBubbleView.swift")
        XCTAssertTrue(riverBubble.contains("BubbleExpandableText("), "Rivière : le texte long est tronqué comme ailleurs")
    }
}
