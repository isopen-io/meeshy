import XCTest
@testable import Meeshy

/// #8147 — un message long se déplie EN PLACE dans le fil, sans saut de
/// défilement. La feuille « Lire plus » n'existe plus.
///
/// #16463 — le déplié est un message ORDINAIRE du mode courant : aucune mise
/// en avant Focal, aucun « Réduire » ; il reste déplié tant que la
/// conversation est ouverte, et plusieurs peuvent l'être.
final class LongMessageExpansionTests: XCTestCase {

    // MARK: - Déplier, jamais replier (#16463)

    func test_expanded_tappingACollapsedMessage_expandsIt() {
        XCTAssertEqual(LongMessageExpansionLaw.expanded(after: [], tapping: "a"), ["a"])
    }

    func test_expanded_tappingASecondMessage_keepsTheFirstExpanded() {
        XCTAssertEqual(LongMessageExpansionLaw.expanded(after: ["a"], tapping: "b"), ["a", "b"])
    }

    func test_expanded_tappingAnExpandedMessage_neverCollapsesIt() {
        XCTAssertEqual(LongMessageExpansionLaw.expanded(after: ["a", "b"], tapping: "a"), ["a", "b"])
    }

    // MARK: - Aucun saut de défilement

    func test_anchor_theTopEdgeIsHeld_theRestUnrollsBeneath() {
        XCTAssertEqual(LongMessageExpansionLaw.anchor, .top)
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

    // MARK: - La feuille de lecture est SUPPRIMÉE (garde de non-retour)

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private func source(_ relativePath: String) throws -> String {
        let raw = try AppSourceGuard.text(at: Self.iosRoot.appendingPathComponent(relativePath))
        return AppSourceGuard.stripComments(raw)
    }

    func test_theReadMoreSheet_isGone_andNothingPresentsItAgain() throws {
        let sheetPath = Self.iosRoot.appendingPathComponent("Meeshy/Features/Focal/Lens/FocalReadMoreSheet.swift").path
        XCTAssertFalse(FileManager.default.fileExists(atPath: sheetPath), "la feuille « Lire plus » est supprimée (#8147)")
        let chain = [
            "Meeshy/Features/Main/Views/ConversationView.swift",
            "Meeshy/Features/Main/Views/ConversationView+MessageListLayer.swift",
            "Meeshy/Features/Main/Views/MessageListView.swift",
            "Meeshy/Features/Main/Views/MessageListViewController.swift",
            "Meeshy/Features/Focal/Core/FocalRowInput.swift",
            "Meeshy/Features/Focal/Row/FocalRow.swift",
        ]
        for path in chain {
            let code = try source(path)
            XCTAssertFalse(code.contains("ReadMorePayload"), "\(path) : plus de charge de feuille de lecture")
            XCTAssertFalse(code.contains("onReadMore"), "\(path) : plus de chaîne vers une feuille — le dépliage se fait en place")
        }
    }

    /// #16463 — le déplié est rendu comme un message ordinaire : ni bloc de
    /// verre, ni loupe, ni voisins atténués, dans aucun mode.
    func test_theExpandedMessage_receivesNoFocalHighlight_inAnyMode() throws {
        let focus = try source("Meeshy/Features/Main/Views/Bubble/LongMessageFocus.swift")
        XCTAssertFalse(focus.contains("FocalGlassBlock"), "Bulles : aucun verre autour du déplié")
        XCTAssertFalse(focus.contains("Loupe"), "aucune loupe sur le déplié")
        let background = try source("Meeshy/Features/Main/Views/Bubble/BubbleBackground.swift")
        XCTAssertFalse(background.contains("LongMessageBubbleBoundsKey"), "la bulle ne remonte plus de cadre à un verre disparu")
        let host = try source("Meeshy/Features/Main/Views/MessageListViewController+LongMessage.swift")
        XCTAssertFalse(host.contains("magnify("), "Bulles/Script/Focal : aucune loupe posée sur les layers")
        XCTAssertFalse(host.contains("alphaFloor"), "aucun voisin atténué")
        let row = try source("Meeshy/Features/Focal/Row/FocalRow.swift")
        XCTAssertFalse(row.contains("input.isExpanded && !input.isFocused"), "Script/Focal : aucun verre sous la rangée dépliée")
        let rows = try source("Meeshy/Features/Main/Views/MessageListViewController+Rows.swift")
        XCTAssertFalse(rows.contains("|| expandedLongMessageLocalId"), "le déplié ne passe pas au premier plan")
        let river = try source("Meeshy/Features/River/View/RiverStreamHost.swift")
        XCTAssertFalse(river.contains("longMessageLoupe"), "Rivière : aucune loupe")
        XCTAssertFalse(river.contains("LongMessageExpansionLaw.alpha"), "Rivière : aucun voisin atténué")
    }

    /// #16463 — aucun contrôle de repli : ni bouton « Réduire », ni action
    /// VoiceOver qui replierait.
    func test_noCollapseControl_existsInAnyMode() throws {
        let text = try source("Meeshy/Features/Main/Views/Bubble/BubbleExpandableText.swift")
        XCTAssertFalse(text.contains("collapseTitle"), "Bulles/Rivière : aucun « Réduire »")
        XCTAssertFalse(text.contains("bubble.expand.less"), "aucun bouton de repli identifiable")
        let row = try source("Meeshy/Features/Focal/Row/FocalRow.swift")
        XCTAssertFalse(row.contains("collapseTitle"), "Script/Focal : aucune action « Réduire »")
    }

    func test_everyReadingMode_mountsTheInPlaceExpansion() throws {
        let row = try source("Meeshy/Features/Focal/Row/FocalRow.swift")
        XCTAssertTrue(row.contains("expansion: expansion"), "Script/Focal : la rangée plate déplie en place")
        let host = try source("Meeshy/Features/Main/Views/MessageListViewController.swift")
        // L'état est lu AVANT la fermeture stockée de la cellule (c97e31e6ca) : la lire dedans capturait le contrôleur
        // en fort — contrôleur → collection → cellule → fermeture → contrôleur.
        XCTAssertTrue(host.contains("let longMessageExpansion = self.longMessageExpansion(for: localId)")
                      && host.contains("messageBubble.longMessageExpansion(longMessageExpansion)"), "Bulles : la bulle reçoit l'état de l'hôte")
        XCTAssertFalse(host.contains("messageBubble.longMessageExpansion(self.longMessageExpansion("),
                       "jamais lu sur `self` dans la fermeture de la cellule")
        XCTAssertTrue(host.contains("focalActions.onToggleExpanded"), "Script/Focal : la rangée remonte le geste à l'hôte")
        let river = try source("Meeshy/Features/River/View/RiverStreamHost.swift")
        XCTAssertTrue(river.contains(".longMessageExpansion(expansion(for: bubble.messageId)"), "Rivière : même dépliage, même effet")
        let riverBubble = try source("Meeshy/Features/River/View/RiverBubbleView.swift")
        XCTAssertTrue(riverBubble.contains("BubbleExpandableText("), "Rivière : le texte long est tronqué comme ailleurs")
    }

    // MARK: - La hauteur s'anime comme sur le web (#8232)

    func test_heightTiming_playsTheWebTempoAndCurve() {
        let timing = LongMessageExpansionLaw.heightTiming(reduceMotion: false)
        XCTAssertEqual(timing?.duration, 0.3)
        XCTAssertEqual(timing?.controlPoints, [0.2, 0, 0, 1])
    }

    func test_heightTiming_underReduceMotion_isAbsent_theHeightLandsAtOnce() {
        XCTAssertNil(LongMessageExpansionLaw.heightTiming(reduceMotion: true))
    }

    func test_pin_invertedList_theVisualTopIsTheEndOfTheSpan() {
        XCTAssertEqual(LongMessageExpansionLaw.pin(for: .top, listIsInverted: true), .end)
        XCTAssertEqual(LongMessageExpansionLaw.pin(for: .bottom, listIsInverted: true), .origin)
        XCTAssertEqual(LongMessageExpansionLaw.pin(for: .top, listIsInverted: false), .origin)
    }

    private typealias Span = LongMessageExpansionLaw.Span

    func test_heightMotion_expanding_unrollsFromTheHeldTop_throughTheWholeCell() {
        // Liste renversée : le haut visuel (tenu) est la FIN de l'intervalle.
        let before = Span(origin: 400, length: 120)
        let after = Span(origin: 100, length: 420)
        let motion = LongMessageExpansionLaw.heightMotion(before: before, after: after, pin: .end)
        XCTAssertEqual(motion?.translationFrom, 0, "le haut n'a pas bougé : aucun glissement du texte")
        XCTAssertEqual(motion?.revealFrom, Span(origin: 300, length: 120), "on voit d'abord l'extrait, collé au haut ; la suite se déroule dessous")
    }

    func test_heightMotion_expandingAtTheBottomOfTheThread_growsUpward_revealingFromTheBottom() {
        let before = Span(origin: 0, length: 120)
        let after = Span(origin: 0, length: 420)
        let motion = LongMessageExpansionLaw.heightMotion(before: before, after: after, pin: .end)
        XCTAssertEqual(motion?.translationFrom, -300, "le haut part de son ancienne place et monte")
        XCTAssertEqual(motion?.revealFrom, Span(origin: 300, length: 120))
    }

    func test_heightMotion_collapsing_isTheMirror_theNeighboursCloseTheGap_nothingIsClipped() {
        let before = Span(origin: 100, length: 420)
        let after = Span(origin: 100, length: 120)
        let collapsed = LongMessageExpansionLaw.heightMotion(before: before, after: after, pin: .origin)
        XCTAssertNil(collapsed, "le bas tenu ne bouge pas, la cellule ne grandit pas : rien à jouer sur elle")
        let neighbour = LongMessageExpansionLaw.heightMotion(
            before: Span(origin: 520, length: 60), after: Span(origin: 220, length: 60), pin: .origin
        )
        XCTAssertEqual(neighbour, .init(translationFrom: 300, revealFrom: nil), "le voisin au-dessus redescend sur la durée, il ne saute pas")
    }

    func test_regionShift_expandThenCollapse_moveTheNeighbourByOppositeAmounts() {
        let expand = LongMessageExpansionLaw.regionShift(
            beyondEnd: true, expandedBefore: Span(origin: 100, length: 120), expandedAfter: Span(origin: 100, length: 420)
        )
        let collapse = LongMessageExpansionLaw.regionShift(
            beyondEnd: true, expandedBefore: Span(origin: 100, length: 420), expandedAfter: Span(origin: 100, length: 120)
        )
        XCTAssertEqual(expand, 300)
        XCTAssertEqual(collapse, -expand, "le repli rejoue le dépliage à l'envers")
        XCTAssertEqual(
            LongMessageExpansionLaw.regionShift(beyondEnd: false, expandedBefore: Span(origin: 100, length: 120), expandedAfter: Span(origin: 100, length: 420)),
            0,
            "ce qui est avant l'origine tenue ne bouge pas"
        )
    }

    func test_heightMotion_anUnmovedCell_playsNothing() {
        XCTAssertNil(LongMessageExpansionLaw.heightMotion(before: Span(origin: 10, length: 50), after: Span(origin: 10, length: 50), pin: .origin))
    }

    func test_everyThreadHost_playsTheSharedTiming_andHonoursReduceMotion() throws {
        let host = try source("Meeshy/Features/Main/Views/MessageListViewController+LongMessage.swift")
        XCTAssertTrue(
            host.contains("LongMessageExpansionLaw.heightTiming(reduceMotion: UIAccessibility.isReduceMotionEnabled)"),
            "Bulles, Script, Focal : la hauteur joue le tempo partagé, coupé sous Réduire le mouvement"
        )
        let river = try source("Meeshy/Features/River/View/RiverStreamHost.swift")
        XCTAssertTrue(river.contains("LongMessageExpansionLaw.heightTiming(reduceMotion: reduceMotion)"), "Rivière : même tempo, même courbe")
        XCTAssertFalse(river.contains(".easeInOut(duration: FocalMetrics.Focus.expandDuration)"), "Rivière : plus de courbe locale")
    }
}
