import XCTest
import SwiftUI
import MeeshyUI
@testable import Meeshy

/// L'aperçu d'appui long NAÎT de la ligne pressée (#18722) : une seule
/// progression animée pilote le cadre et le rayon, de la rangée jusqu'à la
/// carte ; la face de la rangée cède à l'aperçu à mi-course ; le menu attend
/// le seuil ; la rangée source se vide le temps de l'aperçu.
final class ConversationPreviewMorphTests: XCTestCase {

    private let row = CGRect(x: 0, y: 520, width: 393, height: 76)
    private let card = CGRect(x: 0, y: 0, width: 300, height: 420)

    // MARK: - Le cadre

    func test_frame_atZero_isTheRowFrame() {
        XCTAssertEqual(ConversationPreviewMorph.frame(progress: 0, from: row, to: card), row)
    }

    func test_frame_atOne_isThePreviewFrame() {
        XCTAssertEqual(ConversationPreviewMorph.frame(progress: 1, from: row, to: card), card)
    }

    func test_frame_halfway_isTheMidpointOfBothFrames() {
        let frame = ConversationPreviewMorph.frame(progress: 0.5, from: row, to: card)
        XCTAssertEqual(frame.minY, 260, accuracy: 0.001)
        XCTAssertEqual(frame.width, 346.5, accuracy: 0.001)
        XCTAssertEqual(frame.height, 248, accuracy: 0.001)
    }

    func test_frame_alongTheProgress_isMonotone() {
        let frames = stride(from: 0.0, through: 1.0, by: 0.05).map {
            ConversationPreviewMorph.frame(progress: CGFloat($0), from: row, to: card)
        }
        for (previous, next) in zip(frames, frames.dropFirst()) {
            XCTAssertGreaterThanOrEqual(next.height, previous.height, "la carte ne fait que grandir")
            XCTAssertLessThanOrEqual(next.width, previous.width, "elle se resserre vers la largeur de l'aperçu")
            XCTAssertLessThanOrEqual(next.minY, previous.minY, "elle ne fait que monter vers sa place")
        }
    }

    func test_frame_beyondTheEnds_staysBetweenTheTwoFrames() {
        XCTAssertEqual(ConversationPreviewMorph.frame(progress: 1.25, from: row, to: card), card, "le dépassement du ressort ne déforme pas la carte")
        XCTAssertEqual(ConversationPreviewMorph.frame(progress: -0.3, from: row, to: card), row, "le retour du ressort ne passe pas sous la ligne")
    }

    // MARK: - Le rayon

    func test_cornerRadius_interpolatesFromTheRowToTheCard() {
        XCTAssertEqual(ConversationPreviewMorph.cornerRadius(progress: 0, from: 12, to: 24), 12)
        XCTAssertEqual(ConversationPreviewMorph.cornerRadius(progress: 1, from: 12, to: 24), 24)
        XCTAssertEqual(ConversationPreviewMorph.cornerRadius(progress: 0.5, from: 12, to: 24), 18, accuracy: 0.001)
        XCTAssertEqual(ConversationPreviewMorph.cornerRadius(progress: 1.4, from: 12, to: 24), 24, "borné")
    }

    // MARK: - La face de la rangée cède à l'aperçu à mi-course

    func test_rowFace_isWholeAtStart_andGoneAtTheEndOfTheCrossfade() {
        XCTAssertEqual(ConversationPreviewMorph.opacity(of: .rowFace, progress: 0), 1)
        XCTAssertEqual(ConversationPreviewMorph.opacity(of: .rowFace, progress: 0.25), 1)
        XCTAssertEqual(ConversationPreviewMorph.opacity(of: .rowFace, progress: 0.5), 0.5, accuracy: 0.001)
        XCTAssertEqual(ConversationPreviewMorph.opacity(of: .rowFace, progress: 0.75), 0)
        XCTAssertEqual(ConversationPreviewMorph.opacity(of: .rowFace, progress: 1), 0)
    }

    func test_preview_isAbsentUntilTheCrossfade_andWholeAtTheEnd() {
        XCTAssertEqual(ConversationPreviewMorph.opacity(of: .preview, progress: 0.2), 0)
        XCTAssertEqual(ConversationPreviewMorph.opacity(of: .preview, progress: 0.5), 0.5, accuracy: 0.001)
        XCTAssertEqual(ConversationPreviewMorph.opacity(of: .preview, progress: 0.75), 1)
        XCTAssertEqual(ConversationPreviewMorph.opacity(of: .preview, progress: 1.3), 1, "borné")
    }

    /// La recette du décrochage montrait une image BLANCHE : à mi-course, la
    /// face de la rangée avait fini de s'effacer et l'aperçu ne commençait pas.
    func test_faces_neverLeaveTheCardEmpty_atAnyProgress() {
        for step in 0...40 {
            let progress = CGFloat(step) / 40
            let painted = ConversationPreviewMorph.opacity(of: .rowFace, progress: progress)
                + ConversationPreviewMorph.opacity(of: .preview, progress: progress)
            XCTAssertGreaterThanOrEqual(painted, 1 - 1e-9, "carte vide à \(progress)")
        }
    }

    func test_surface_isAbsentOnTheRow_andWholeFromHalfway() {
        XCTAssertEqual(ConversationPreviewMorph.opacity(of: .surface, progress: 0), 0, "sur la ligne, aucun fond de carte : la rangée de la liste n'en a pas")
        XCTAssertEqual(ConversationPreviewMorph.opacity(of: .surface, progress: 0.25), 0.5, accuracy: 0.001)
        XCTAssertEqual(ConversationPreviewMorph.opacity(of: .surface, progress: 0.5), 1, "la carte est soulevée quand l'aperçu commence à se fondre")
        XCTAssertEqual(ConversationPreviewMorph.opacity(of: .surface, progress: -0.2), 0, "borné")
    }

    // MARK: - Le rendu de la carte : la même ligne, une ombre de forme

    func test_overlay_paintsTheLiftShadowFromTheCardShape_neverFromItsContent() throws {
        let overlays = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationListView+Overlays.swift"))
        XCTAssertTrue(overlays.contains("shape.fill(surface)"), "l'ombre suit la forme : aucun rendu hors écran du contenu à chaque image")
        XCTAssertTrue(overlays.contains("ConversationPreviewMorph.opacity(of: .surface"), "le fond de la carte naît avec elle")
    }

    func test_rowFace_mirrorsTheListRowMux() throws {
        let overlays = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationListView+Overlays.swift"))
        XCTAssertTrue(overlays.contains("ConversationPeekRowFace("), "la face de départ est une vue à part")
        let rows = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationListView+Rows.swift"))
        XCTAssertTrue(rows.contains("struct ConversationPeekRowFace"),
                      "la face vit avec l'aiguillage de la liste : la construction de LentilleConversationRow ne quitte jamais +Rows (I-067)")
        XCTAssertTrue(rows.contains("LentilleFeatureFlag.isLentilleListEnabled"), "elle rend la MÊME rangée que la liste, Lentille comprise")
        XCTAssertTrue(overlays.contains("typingUsername: conversationViewModel.typingUsernames[conversation.id]"), "frappe et brouillon y figurent comme sur la ligne")
        XCTAssertTrue(overlays.contains("draftSummary: conversationViewModel.draftSummaries[conversation.id]"))
    }

    // MARK: - Le menu attend le seuil

    func test_menuThreshold_isEightyPercentOfTheMorph() {
        XCTAssertEqual(ConversationPreviewMorph.menuThreshold, 0.8)
    }

    func test_showsMenu_belowTheThreshold_isFalse_fromTheThreshold_isTrue() {
        XCTAssertFalse(ConversationPreviewMorph.showsMenu(progress: 0.79))
        XCTAssertTrue(ConversationPreviewMorph.showsMenu(progress: 0.8))
        XCTAssertTrue(ConversationPreviewMorph.showsMenu(progress: 1))
    }

    func test_menuReveal_isNullBeforeTheThreshold_andWholeAtTheEnd() {
        XCTAssertEqual(ConversationPreviewMorph.menuReveal(progress: 0.5), 0)
        XCTAssertEqual(ConversationPreviewMorph.menuReveal(progress: 0.8), 0)
        XCTAssertEqual(ConversationPreviewMorph.menuReveal(progress: 0.9), 0.5, accuracy: 0.001)
        XCTAssertEqual(ConversationPreviewMorph.menuReveal(progress: 1.2), 1)
    }

    func test_menuRise_comesFromBelow_andIsNullUnderReduceMotion() {
        XCTAssertGreaterThan(ConversationPreviewMorph.menuRise(progress: 0.85, reduceMotion: false), 0, "le menu monte depuis le bas")
        XCTAssertEqual(ConversationPreviewMorph.menuRise(progress: 1, reduceMotion: false), 0)
        XCTAssertEqual(ConversationPreviewMorph.menuRise(progress: 0.85, reduceMotion: true), 0, "Réduire les animations : il ne se déplace pas")
    }

    // MARK: - D'où la carte part

    func test_morphsFromRow_onlyWithARowAndWithoutReduceMotion() {
        XCTAssertTrue(ConversationPreviewMorph.morphsFromRow(hasSource: true, reduceMotion: false))
        XCTAssertFalse(ConversationPreviewMorph.morphsFromRow(hasSource: true, reduceMotion: true), "fondu sur place")
        XCTAssertFalse(ConversationPreviewMorph.morphsFromRow(hasSource: false, reduceMotion: false), "rotor VoiceOver : aucune ligne d'où partir")
    }

    func test_startProgress_fromTheRow_isZero_otherwiseTheRestingCard() {
        XCTAssertEqual(ConversationPreviewMorph.startProgress(hasSource: true, reduceMotion: false), 0)
        XCTAssertEqual(ConversationPreviewMorph.startProgress(hasSource: true, reduceMotion: true), 1)
        XCTAssertEqual(ConversationPreviewMorph.startProgress(hasSource: false, reduceMotion: false), 1)
    }

    func test_sourceInSlot_expressesTheRowInTheCardCoordinates() {
        let slot = CGRect(x: 46, y: 140, width: 300, height: 420)
        let local = ConversationPreviewMorph.sourceInSlot(row, slot: slot)
        XCTAssertEqual(local, CGRect(x: -46, y: 380, width: 393, height: 76))
        XCTAssertNil(ConversationPreviewMorph.sourceInSlot(nil, slot: slot))
    }

    // MARK: - L'opacité de la carte : tant qu'elle n'est pas l'aperçu, c'est la ligne

    func test_cardOpacity_placedOnTheRow_isVisibleBeforeTheEntrance() {
        XCTAssertEqual(ConversationPreviewMorph.cardOpacity(isAppeared: false, progress: 0), 1)
    }

    func test_cardOpacity_mountedAtRest_isInvisibleUntilItAppears() {
        XCTAssertEqual(ConversationPreviewMorph.cardOpacity(isAppeared: false, progress: 1), 0, "montage au repos, invisible : rien ne flashe")
        XCTAssertEqual(ConversationPreviewMorph.cardOpacity(isAppeared: true, progress: 1), 1)
    }

    func test_cardOpacity_returningToTheRow_staysOpaqueUntilItIsTheRowAgain() {
        XCTAssertEqual(ConversationPreviewMorph.cardOpacity(isAppeared: false, progress: 0), 1)
    }

    // MARK: - Le retrait

    func test_exit_fromTheRest_morphsBackToTheRow() {
        XCTAssertEqual(ConversationPreviewMorph.exit(hasSource: true, reduceMotion: false, chipLatched: false, pulledPastDismiss: false), .morphToRow)
    }

    func test_exit_ofAChip_orPastTheDismissPull_fadesInPlace() {
        XCTAssertEqual(ConversationPreviewMorph.exit(hasSource: true, reduceMotion: false, chipLatched: true, pulledPastDismiss: false), .fadeInPlace,
                       "la pastille relâchée fond sous le doigt")
        XCTAssertEqual(ConversationPreviewMorph.exit(hasSource: true, reduceMotion: false, chipLatched: false, pulledPastDismiss: true), .fadeInPlace)
    }

    /// Une pastille lâchée hors de tout en-tête n'a rien déplacé : elle revient
    /// à sa place en ressort, la rangée reparaît dans la même image.
    func test_exit_ofAChipReleasedAwayFromAnyHeader_springsBackToItsSlot() {
        XCTAssertEqual(ConversationPreviewMorph.exit(hasSource: true, reduceMotion: false, chipLatched: true, pulledPastDismiss: true,
                                                     chipReturnsToSlot: true), .morphToRow)
        XCTAssertEqual(ConversationPreviewMorph.exit(hasSource: true, reduceMotion: true, chipLatched: true, pulledPastDismiss: true,
                                                     chipReturnsToSlot: true), .fadeInPlace, "sous Réduire les animations, un fondu")
    }

    /// La carte rejoint sa place quand elle redevient la ligne ou qu'une
    /// fermeture ordinaire la laisse fondre ; tirée au-delà de la fermeture ou
    /// décrochée, elle fond SOUS LE DOIGT, sans aller-retour.
    func test_returnsHome_onlyWhenItMorphsBack_orAnOrdinaryCloseFades() {
        XCTAssertTrue(ConversationPreviewMorph.returnsHome(after: .morphToRow, chipLatched: true, pulledPastDismiss: true))
        XCTAssertTrue(ConversationPreviewMorph.returnsHome(after: .fadeInPlace, chipLatched: false, pulledPastDismiss: false))
        XCTAssertFalse(ConversationPreviewMorph.returnsHome(after: .fadeInPlace, chipLatched: true, pulledPastDismiss: false))
        XCTAssertFalse(ConversationPreviewMorph.returnsHome(after: .fadeInPlace, chipLatched: false, pulledPastDismiss: true))
    }

    func test_exit_underReduceMotion_orWithoutARow_fadesInPlace() {
        XCTAssertEqual(ConversationPreviewMorph.exit(hasSource: true, reduceMotion: true, chipLatched: false, pulledPastDismiss: false), .fadeInPlace)
        XCTAssertEqual(ConversationPreviewMorph.exit(hasSource: false, reduceMotion: false, chipLatched: false, pulledPastDismiss: false), .fadeInPlace)
    }

    // MARK: - Le mouvement de l'entrée et du retrait

    /// Le sens du mouvement se lit dans la valeur visée : vers la carte, le
    /// ressort d'entrée ; vers la ligne, celui du retrait ; réduit, un fondu.
    @MainActor
    func test_morphAnimation_towardTheCard_isTheEntrance_towardTheRow_isTheReturn() {
        XCTAssertEqual(ConversationPreviewEntranceMotion.animation(toward: 1, reduceMotion: false), MeeshyAnimation.previewMorph)
        XCTAssertEqual(ConversationPreviewEntranceMotion.animation(toward: 0, reduceMotion: false), MeeshyAnimation.previewMorphReturn)
        XCTAssertEqual(ConversationPreviewEntranceMotion.animation(toward: 1, reduceMotion: true),
                       ConversationPreviewEntranceMotion.entrance(reduceMotion: true))
    }

    /// La recette ne montrait AUCUNE interpolation : une animation explicite
    /// posée par `withAnimation` n'atteignait pas l'overlay de la liste (journal
    /// RECETTE : `transaction.animation == nil` au rendu, à chaque étage). Le
    /// mouvement est donc porté par l'overlay lui-même, sur ses deux valeurs.
    func test_overlay_carriesItsOwnMotion_onProgressAndAppearance() throws {
        let overlays = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationListView+Overlays.swift"))
        XCTAssertTrue(overlays.contains("ConversationPreviewMorphMotion(progress: previewMorphProgress, appeared: contextMenuAppeared"))
    }

    // MARK: - Le cadre RENDU de la carte (pas seulement la loi)

    /// Les lois étaient vertes pendant que les pixels étaient faux : ce témoin
    /// mesure la carte RENDUE, dans une fenêtre, à la place que la liste lui donne.
    @MainActor
    func test_renderedCard_atProgressZero_sitsOnTheRowFrame_andAtOne_fillsItsSlot() throws {
        let slot = CGRect(x: 40, y: 100, width: 300, height: 420)
        let source = CGRect(x: 8, y: 492, width: 386, height: 84)

        let start = try XCTUnwrap(renderedFrames(progress: 0, source: source, slot: slot)["rowFace"])
        let rest = try XCTUnwrap(renderedFrames(progress: 1, source: source, slot: slot)["preview"])

        XCTAssertEqual(start.minX, source.minX, accuracy: 0.5, "la carte NAÎT sur la rangée pressée")
        XCTAssertEqual(start.minY, source.minY, accuracy: 0.5)
        XCTAssertEqual(start.width, source.width, accuracy: 0.5)
        XCTAssertEqual(start.height, source.height, accuracy: 0.5)
        XCTAssertEqual(rest.minX, slot.minX, accuracy: 0.5, "posée, elle occupe sa place")
        XCTAssertEqual(rest.minY, slot.minY, accuracy: 0.5)
        XCTAssertEqual(rest.height, slot.height, accuracy: 0.5)
    }

    @MainActor
    func test_renderedPreview_midway_staysCenteredInTheCardFrame() throws {
        let slot = CGRect(x: 40, y: 100, width: 300, height: 420)
        let source = CGRect(x: 8, y: 492, width: 386, height: 84)
        let card = ConversationPreviewMorph.frame(progress: 0.5, from: source, to: slot)

        let preview = try XCTUnwrap(renderedFrames(progress: 0.5, source: source, slot: slot)["preview"])

        XCTAssertEqual(preview.width, slot.width, accuracy: 0.5, "l'aperçu garde sa mise en page de repos : rien ne se remet en page pendant le ressort")
        XCTAssertEqual(preview.midX, card.midX, accuracy: 0.5,
                       "la rangée est plus large que la carte : l'aperçu se centre dans le cadre qui passe de l'une à l'autre, jamais calé à gauche")
    }

    func test_previewInset_centersTheRestingPreviewInTheCurrentFrame() {
        XCTAssertEqual(ConversationPeekPullDown.previewInset(frameWidth: 386, restWidth: 300), 43)
        XCTAssertEqual(ConversationPeekPullDown.previewInset(frameWidth: 300, restWidth: 300), 0, "posée, l'aperçu est à sa place")
        XCTAssertEqual(ConversationPeekPullDown.previewInset(frameWidth: 260, restWidth: 300), -20, "comprimée vers la ligne, l'aperçu se découpe au centre")
    }

    func test_cardFrame_isTheBirthFrameCompressedTowardTheRow() {
        let from = CGRect(x: 0, y: 300, width: 386, height: 84)
        let to = CGRect(x: 40, y: 0, width: 300, height: 420)
        let row = CGRect(x: 0, y: 336, width: 386, height: 84)
        XCTAssertEqual(ConversationPeekPullDown.cardFrame(morph: 1, detach: 0, from: from, to: to, row: row), to)
        XCTAssertEqual(ConversationPeekPullDown.cardFrame(morph: 0, detach: 0, from: from, to: to, row: row), from)
        XCTAssertEqual(ConversationPeekPullDown.cardFrame(morph: 1, detach: 1, from: from, to: to, row: row), row)
    }

    func test_peekCard_hasOneEdge_drawnByTheMorphFrame_neverByThePreviewInside() throws {
        let overlays = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationListView+Overlays.swift"))
        let helpers = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationListHelpers.swift"))
        XCTAssertTrue(overlays.contains("ConversationPreviewMorphEdge"), "le cadre du morphisme porte le contour de la carte")
        XCTAssertTrue(helpers.contains(".modifier(ConversationPreviewCardChrome(isEnabled: peekHeights == nil"),
                      "dans l'aperçu d'appui long, l'aperçu ne dessine ni contour, ni ombre, ni découpe : une seule carte, pas deux bords")
    }

    @MainActor
    private func renderedFrames(progress: CGFloat, source: CGRect, slot: CGRect) -> [String: CGRect] {
        let probe = RenderedFrames()
        let card = ConversationPreviewMorphCard(
            progress: progress, source: source, accent: .blue, surface: .white,
            rowFace: RenderedFrameReporter(name: "rowFace", probe: probe),
            preview: RenderedFrameReporter(name: "preview", probe: probe)
        )
        let root = ZStack(alignment: .topLeading) {
            card.frame(width: slot.width, height: slot.height).offset(x: slot.minX, y: slot.minY)
        }
        .frame(width: 402, height: 874, alignment: .topLeading)
        .ignoresSafeArea()
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 402, height: 874))
        window.rootViewController = UIHostingController(rootView: root)
        window.makeKeyAndVisible()
        RunLoop.main.run(until: Date().addingTimeInterval(0.3))
        window.isHidden = true
        return probe.frames
    }

    // MARK: - La rangée source se vide le temps de l'aperçu

    func test_sourceRowOpacity_onlyTheConcealedRowIsEmptied() {
        XCTAssertEqual(ConversationPreviewMorph.sourceRowOpacity(conversationId: "a", concealedId: "a"), 0)
        XCTAssertEqual(ConversationPreviewMorph.sourceRowOpacity(conversationId: "b", concealedId: "a"), 1)
        XCTAssertEqual(ConversationPreviewMorph.sourceRowOpacity(conversationId: "a", concealedId: nil), 1)
    }

    @MainActor
    func test_sourceRowRegistry_concealsOneRow_andRevealsItAtTheEnd() {
        let registry = ConversationPreviewSourceRow()
        registry.conceal("a")
        XCTAssertEqual(registry.concealedId, "a")
        registry.conceal("b")
        XCTAssertEqual(registry.concealedId, "b", "une réouverture sur une autre ligne rend la première")
        registry.conceal(nil)
        XCTAssertNil(registry.concealedId)
    }

    // MARK: - Un appui long n'ouvre jamais la conversation (#17316)

    func test_rowPress_longPressThenRelease_neverOpensTheConversation() {
        var press = ConversationRowPress()
        _ = press.handle(.began)
        XCTAssertEqual(press.handle(.longPressRecognized), .showPeek)
        _ = press.handle(.released)
        XCTAssertEqual(press.handle(.tapped), .none)
    }

    // MARK: - Gardes de montage

    func test_overlay_morphsTheCardFromTheRowFrame_neverByScaleAndBlur() throws {
        let overlays = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationListView+Overlays.swift"))
        XCTAssertTrue(overlays.contains("ConversationPreviewMorphCard("), "la carte est le morphisme du cadre de la rangée")
        XCTAssertTrue(overlays.contains("source: contextMenuSourceFrame"), "la carte reçoit le cadre de la rangée pressée")
        XCTAssertTrue(overlays.contains("progress: previewMorphProgress"), "une seule progression animée pilote cadre et rayon")
        XCTAssertFalse(overlays.contains("scaleEffect(previewScale"), "plus d'échelle depuis le centre")
        XCTAssertFalse(overlays.contains(".blur(radius: ConversationPreviewEntranceMotion"), "plus de flou d'émergence")
        XCTAssertTrue(overlays.contains("MeeshyAnimation.previewMorph"), "le ressort est un jeton")
    }

    func test_peek_holdsTheMenuUntilTheThreshold() throws {
        let peek = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationLongPressPeek.swift"))
        let overlays = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationListView+Overlays.swift"))
        XCTAssertTrue(peek.contains("ConversationPreviewMenuReveal(progress: morphProgress"), "le menu lit la progression du morphisme")
        XCTAssertTrue(overlays.contains("morphProgress: previewMorphProgress"), "la liste la lui passe")
        XCTAssertTrue(overlays.contains("ConversationPreviewMorph.showsMenu(progress:"), "une loi pure dit s'il se montre")
    }

    func test_sourceRow_isEmptiedDuringThePreview_andReturnsAtTheEnd() throws {
        let rows = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationListView+Rows.swift"))
        let overlays = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationListView+Overlays.swift"))
        XCTAssertTrue(rows.contains("onTrigger(frameBox.rect)"), "la rangée pressée passe son cadre")
        let measure = try XCTUnwrap(rows.range(of: "frameBox.rect = frame"), "la rangée mesure son cadre")
        let pressScale = try XCTUnwrap(rows.range(of: ".scaleEffect(isPressing ? pressedScale : 1.0)"))
        XCTAssertLessThan(pressScale.lowerBound, measure.lowerBound,
                          "le cadre se mesure HORS de l'échelle d'appui : la carte revient sur la ligne à sa taille, sans saut au retrait")
        XCTAssertTrue(rows.contains("RowPressBounceModifier(onTap: onTap, onTrigger: onLongPress, conversationId: conversation.id)"), "la rangée pressée dit qui elle est")
        XCTAssertTrue(rows.contains(".modifier(ConcealedWhilePreviewed(conversationId: conversationId"), "la rangée source se vide par opacité")
        XCTAssertTrue(overlays.contains("ConversationPreviewSourceRow.shared.conceal(nil)"), "elle revient au retrait")
    }
}

/// Les cadres GLOBAUX que les calques de la carte occupent une fois rendus.
@MainActor
private final class RenderedFrames {
    var frames: [String: CGRect] = [:]
}

private struct RenderedFrameReporter: View {
    let name: String
    let probe: RenderedFrames

    var body: some View {
        Color.clear.onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { probe.frames[name] = $0 }
    }
}
