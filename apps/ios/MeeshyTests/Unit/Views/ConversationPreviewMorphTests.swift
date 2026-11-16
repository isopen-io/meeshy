import XCTest
import SwiftUI
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

    func test_rowFace_isWholeAtStart_andGoneFromHalfway() {
        XCTAssertEqual(ConversationPreviewMorph.opacity(of: .rowFace, progress: 0), 1)
        XCTAssertEqual(ConversationPreviewMorph.opacity(of: .rowFace, progress: 0.25), 0.5, accuracy: 0.001)
        XCTAssertEqual(ConversationPreviewMorph.opacity(of: .rowFace, progress: 0.5), 0)
        XCTAssertEqual(ConversationPreviewMorph.opacity(of: .rowFace, progress: 1), 0)
    }

    func test_preview_isAbsentUntilHalfway_andWholeAtTheEnd() {
        XCTAssertEqual(ConversationPreviewMorph.opacity(of: .preview, progress: 0.4), 0)
        XCTAssertEqual(ConversationPreviewMorph.opacity(of: .preview, progress: 0.75), 0.5, accuracy: 0.001)
        XCTAssertEqual(ConversationPreviewMorph.opacity(of: .preview, progress: 1), 1)
        XCTAssertEqual(ConversationPreviewMorph.opacity(of: .preview, progress: 1.3), 1, "borné")
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
        XCTAssertTrue(overlays.contains("LentilleFeatureFlag.isLentilleListEnabled"), "elle rend la MÊME rangée que la liste, Lentille comprise")
        XCTAssertTrue(overlays.contains("LentilleConversationRow("))
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

    func test_exit_underReduceMotion_orWithoutARow_fadesInPlace() {
        XCTAssertEqual(ConversationPreviewMorph.exit(hasSource: true, reduceMotion: true, chipLatched: false, pulledPastDismiss: false), .fadeInPlace)
        XCTAssertEqual(ConversationPreviewMorph.exit(hasSource: false, reduceMotion: false, chipLatched: false, pulledPastDismiss: false), .fadeInPlace)
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
