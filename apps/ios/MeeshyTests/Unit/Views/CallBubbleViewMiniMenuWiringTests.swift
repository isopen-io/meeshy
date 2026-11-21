import XCTest
@testable import Meeshy

/// #19696 — réduit en cercle ou en vignette, l'appel ne montre que la personne (sa vidéo, sinon son
/// avatar) et la durée : aucun bouton d'appel, ni mini-menu à l'appui long ni barre aux paliers
/// rectangle. Le toucher rend le plein écran, où vivent les commandes. Seul « Arrêter le partage »
/// reste, pendant un partage d'écran : garde de confidentialité, pas commande d'appel.
@MainActor
final class CallBubbleViewMiniMenuWiringTests: XCTestCase {

    private func callBubbleViewSource() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallBubbleView.swift"))
    }

    func test_reducedCall_carriesNoCallButton() throws {
        let source = try callBubbleViewSource()
        for gone in ["callManager.toggleMute()", "callManager.toggleSpeaker()", "callManager.endCall()",
                     "muteButton", "speakerButton", "hangupButton", "tierControlBar", "LongPressGesture", "isMenuRevealed"] {
            XCTAssertFalse(source.contains(gone), "« \(gone) » ne vit plus sur l'appel réduit")
        }
    }

    func test_reducedCall_showsThePerson_andTheDuration() throws {
        let source = try callBubbleViewSource()
        XCTAssertTrue(source.contains("CallParticipantVisual(width: size.width, height: size.height, cornerRadius: cornerRadius, callManager: callManager)"),
                      "la vignette porte la vidéo de l'autre, sinon son avatar (#19701 : plus de disque)")
        XCTAssertTrue(source.contains("CallReducedCaption(callManager: callManager, style: .glass)"),
                      "en vignette, l'étiquette « nom · durée »")
    }

    func test_tapOnBubble_expandsToFullScreen() throws {
        let source = try callBubbleViewSource()
        XCTAssertTrue(source.contains(".onTapGesture { expandToFullScreen(in: geometry) }"))
    }

    func test_shareStop_isTheOnlyControlLeft_whileSharing() throws {
        let source = try callBubbleViewSource()
        XCTAssertTrue(source.contains("CallReturnPoint.showsShareStop(isSharing: callManager.screenShare.isSharing)"))
        XCTAssertTrue(source.contains("CallShareStopButton"))
    }
}
