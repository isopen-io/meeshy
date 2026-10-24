import XCTest
import MeeshySDK
@testable import Meeshy

/// **L'aperçu d'appui long d'un message suit le mode de lecture du fil**
/// (#11208, décision #11204, qui supplante la directive du 2026-08-23).
///
/// En Script et en Focal, la cellule pressée est une rangée plate : l'aperçu
/// rend la MÊME rangée. En Bulles, en Rivière et dans le Résumé, il rend la
/// bulle. Une loi pure le décide, jamais un booléen recopié à la main.
@MainActor
final class MessageOverlayPreviewKindTests: XCTestCase {

    func test_resolve_script_isTheFlatRow() {
        XCTAssertEqual(MessageOverlayPreviewKind.resolve(readingMode: .script), .flatRow)
    }

    func test_resolve_focal_isTheFlatRow() {
        XCTAssertEqual(MessageOverlayPreviewKind.resolve(readingMode: .focal), .flatRow)
    }

    func test_resolve_bubbles_isTheBubble() {
        XCTAssertEqual(MessageOverlayPreviewKind.resolve(readingMode: .bubbles), .bubble)
    }

    func test_resolve_river_isTheBubble() {
        XCTAssertEqual(MessageOverlayPreviewKind.resolve(readingMode: .river), .bubble)
    }

    func test_resolve_summary_isTheBubble() {
        XCTAssertEqual(MessageOverlayPreviewKind.resolve(readingMode: .summary), .bubble)
    }

    /// La loi est celle du fil, cas pour cas : un mode qui rend une rangée plate
    /// dans la liste rend une rangée plate dans l'aperçu, et seulement lui.
    func test_resolve_matchesTheThreadRowForEveryMode() {
        for mode in ConversationReadingMode.allCases {
            XCTAssertEqual(MessageOverlayPreviewKind.resolve(readingMode: mode) == .flatRow, mode.usesFlatRow, "\(mode)")
        }
    }

    /// La densité de la rangée est celle de la cellule (`focalRowInput`).
    func test_density_script_isScript_andFocal_isFocal() {
        XCTAssertEqual(MessageOverlayPreviewKind.density(for: .script), .script)
        XCTAssertEqual(MessageOverlayPreviewKind.density(for: .focal), .focal)
    }

    /// Le fil transmet son mode à l'overlay : la bande de drapeaux du texte
    /// servi (`previewServedText`) et la face de l'aperçu lisent la même valeur.
    func test_threadLanguage_flatRowFollowsTheReadingMode() {
        XCTAssertTrue(MessageOverlayMenu.ThreadLanguage(readingMode: .script).usesFlatRow)
        XCTAssertFalse(MessageOverlayMenu.ThreadLanguage(readingMode: .bubbles).usesFlatRow)
        XCTAssertFalse(MessageOverlayMenu.ThreadLanguage().usesFlatRow, "sans mode transmis, l'aperçu est une bulle")
    }

    /// La rangée se pose à 16 pt des bords de l'écran, comme une carte.
    func test_flatRowMargin_isSixteenPoints() {
        XCTAssertEqual(MessageOverlayCellPreview.flatRowMargin, 16)
    }

    /// Sous « Réduire les animations », l'entrée est un fondu bref, jamais un ressort.
    func test_reducedMotionEntrance_isAShortFade() {
        XCTAssertEqual(MessageOverlayMenu.reducedMotionFadeDuration, 0.18, accuracy: 0.0001)
    }

    // MARK: - Le cadre de la cellule passe dans le repère de l'overlay

    /// iPad, paysage : la conversation vit dans la colonne de droite, à 400 pt
    /// du bord de la fenêtre. Le cadre de la cellule arrive en coordonnées de
    /// FENÊTRE (`cellFrameInWindow`) ; l'overlay place l'aperçu dans SON repère.
    /// Sans conversion, la bulle s'ouvrait 400 pt à droite de sa cellule.
    func test_sourceFrame_conversationInTheRightColumn_isShiftedIntoTheOverlay() {
        let local = MessageOverlayMenu.sourceFrame(
            windowFrame: CGRect(x: 450, y: 300, width: 320, height: 60),
            containerOrigin: CGPoint(x: 400, y: 0))

        XCTAssertEqual(local, CGRect(x: 50, y: 300, width: 320, height: 60))
    }

    func test_sourceFrame_overlayAtTheWindowOrigin_isUnchanged() {
        let frame = CGRect(x: 16, y: 420, width: 343, height: 72)

        XCTAssertEqual(MessageOverlayMenu.sourceFrame(windowFrame: frame, containerOrigin: .zero), frame)
    }

    func test_sourceFrame_overlayBelowTheWindowTop_isShiftedUp() {
        let local = MessageOverlayMenu.sourceFrame(
            windowFrame: CGRect(x: 16, y: 420, width: 343, height: 72),
            containerOrigin: CGPoint(x: 0, y: 24))

        XCTAssertEqual(local, CGRect(x: 16, y: 396, width: 343, height: 72))
    }

    /// Sans cellule matérialisée, aucun cadre : l'aperçu se pose au centre, et
    /// la conversion ne fabrique pas un cadre là où il n'y en a pas.
    func test_sourceFrame_noCellFrame_staysZero() {
        XCTAssertEqual(MessageOverlayMenu.sourceFrame(windowFrame: .zero, containerOrigin: CGPoint(x: 400, y: 0)), .zero)
    }
}

/// **L'aperçu d'appui long LIT les vocaux et les vidéos, dans les TROIS modes**
/// (#11339, décision porteur, option B).
///
/// Seule la zone de lecture d'une pièce se touche ; le reste de l'aperçu garde
/// le glissement du cluster. La loi ne dépend PAS du mode de lecture : Bulles,
/// Script et Focal lisent ensemble, jamais un seul. Et l'aperçu ne lit jamais
/// ce que le fil retient (vue unique, flou, chiffré scellé, échu).
@MainActor
final class MessageOverlayPreviewTouchTests: XCTestCase {

    // MARK: - Fabriques

    private func voice(id: String = "a1", isViewOnce: Bool = false, isBlurred: Bool = false) -> MessageAttachment {
        MessageAttachment(id: id, messageId: "m1", fileName: "v.m4a", mimeType: "audio/mp4",
                          fileUrl: "https://cdn/orig-ko.m4a", isViewOnce: isViewOnce, isBlurred: isBlurred)
    }

    private func video(id: String = "v1", fileUrl: String = "https://cdn/clip.mp4") -> MessageAttachment {
        MessageAttachment(id: id, messageId: "m1", fileName: "clip.mp4", mimeType: "video/mp4", fileUrl: fileUrl)
    }

    private func photo(id: String = "p1") -> MessageAttachment {
        MessageAttachment(id: id, messageId: "m1", fileName: "p.jpg", mimeType: "image/jpeg", fileUrl: "https://cdn/p.jpg")
    }

    private func message(_ attachments: [MessageAttachment], content: String = "",
                         viewOnce: Bool = false, blurred: Bool = false, encrypted: Bool = false,
                         expiresAt: Date? = nil) -> Message {
        var message = Message(id: "m1", conversationId: "c1", senderId: "u2", content: content,
                              originalLanguage: "ko", expiresAt: expiresAt, isEncrypted: encrypted,
                              attachments: attachments, senderName: "Minjun")
        message.isViewOnce = viewOnce
        message.isBlurred = blurred
        return message
    }

    // MARK: - Les trois modes lisent ensemble

    func test_resolve_voice_isPlayable_inEveryReadingMode() {
        for mode in ConversationReadingMode.allCases {
            let touch = MessageOverlayPreviewTouch.resolve(message: message([voice()]), readingMode: mode)
            XCTAssertEqual(touch.playableAttachmentIds, ["a1"], "\(mode)")
            XCTAssertTrue(touch.offersPlayback, "\(mode)")
        }
    }

    func test_resolve_video_isPlayable_inEveryReadingMode() {
        for mode in ConversationReadingMode.allCases {
            let touch = MessageOverlayPreviewTouch.resolve(message: message([video()]), readingMode: mode)
            XCTAssertEqual(touch.playableAttachmentIds, ["v1"], "\(mode)")
        }
    }

    /// La face suit le mode (#11208) ; la zone tactile, elle, ne le suit pas.
    func test_resolve_kindFollowsTheMode_butTheZoneDoesNot() {
        let script = MessageOverlayPreviewTouch.resolve(message: message([voice(), video()]), readingMode: .script)
        let focal = MessageOverlayPreviewTouch.resolve(message: message([voice(), video()]), readingMode: .focal)
        let bubbles = MessageOverlayPreviewTouch.resolve(message: message([voice(), video()]), readingMode: .bubbles)

        XCTAssertEqual(script.kind, .flatRow)
        XCTAssertEqual(focal.kind, .flatRow)
        XCTAssertEqual(bubbles.kind, .bubble)
        XCTAssertEqual(script.playableAttachmentIds, bubbles.playableAttachmentIds)
        XCTAssertEqual(focal.playableAttachmentIds, bubbles.playableAttachmentIds)
    }

    // MARK: - Par type

    func test_resolve_textOnly_offersNoPlayback() {
        let touch = MessageOverlayPreviewTouch.resolve(message: message([], content: "Bonjour"), readingMode: .bubbles)
        XCTAssertFalse(touch.offersPlayback, "un texte reste une image : tout part au glissement du cluster")
    }

    func test_resolve_photo_isNotAPlaybackZone() {
        let touch = MessageOverlayPreviewTouch.resolve(message: message([photo(), voice()]), readingMode: .focal)
        XCTAssertEqual(touch.playableAttachmentIds, ["a1"])
    }

    func test_resolve_videoWithoutFile_isNotPlayable() {
        let touch = MessageOverlayPreviewTouch.resolve(message: message([video(fileUrl: "")]), readingMode: .bubbles)
        XCTAssertFalse(touch.offersPlayback)
    }

    // MARK: - Jamais lisible si le fil ne le lit pas

    func test_resolve_viewOnceMessage_offersNoPlayback() {
        let touch = MessageOverlayPreviewTouch.resolve(message: message([video()], viewOnce: true), readingMode: .bubbles)
        XCTAssertFalse(touch.offersPlayback)
    }

    func test_resolve_viewOncePiece_offersNoPlayback() {
        let touch = MessageOverlayPreviewTouch.resolve(message: message([voice(isViewOnce: true)]), readingMode: .script)
        XCTAssertFalse(touch.offersPlayback)
    }

    func test_resolve_blurredMessage_offersNoPlayback() {
        let touch = MessageOverlayPreviewTouch.resolve(message: message([video()], blurred: true), readingMode: .focal)
        XCTAssertFalse(touch.offersPlayback)
    }

    func test_resolve_blurredPiece_offersNoPlayback() {
        let touch = MessageOverlayPreviewTouch.resolve(message: message([voice(isBlurred: true)]), readingMode: .bubbles)
        XCTAssertFalse(touch.offersPlayback)
    }

    func test_resolve_sealedEncryptedMessage_offersNoPlayback() {
        let touch = MessageOverlayPreviewTouch.resolve(message: message([voice()], encrypted: true), readingMode: .bubbles)
        XCTAssertFalse(touch.offersPlayback, "chiffré et illisible ici : le fil montre un cadenas, l'aperçu aussi")
    }

    func test_resolve_expiredEphemeral_offersNoPlayback() {
        let now = Date()
        let touch = MessageOverlayPreviewTouch.resolve(
            message: message([voice()], expiresAt: now.addingTimeInterval(-1)), readingMode: .bubbles, now: now)
        XCTAssertFalse(touch.offersPlayback)
    }

    /// Un éphémère VIVANT se lit dans le fil : l'aperçu le lit aussi.
    func test_resolve_liveEphemeral_isPlayable() {
        let now = Date()
        let touch = MessageOverlayPreviewTouch.resolve(
            message: message([voice()], expiresAt: now.addingTimeInterval(600)), readingMode: .focal, now: now)
        XCTAssertEqual(touch.playableAttachmentIds, ["a1"])
    }

    // MARK: - Les trous du masque

    func test_holes_keepOnlyPlayableZones_clippedToTheBounds() {
        let bounds = CGRect(x: 0, y: 0, width: 300, height: 200)
        let holes = MessageOverlayPreviewTouch.holes(
            zones: [(attachmentId: "a1", frame: CGRect(x: 10, y: 150, width: 200, height: 80)),
                    (attachmentId: "p1", frame: CGRect(x: 0, y: 0, width: 300, height: 100))],
            playable: ["a1"], in: bounds)

        XCTAssertEqual(holes, [CGRect(x: 10, y: 150, width: 200, height: 50)])
    }

    func test_holes_zoneOutsideTheBounds_isDropped() {
        let holes = MessageOverlayPreviewTouch.holes(
            zones: [(attachmentId: "a1", frame: CGRect(x: 0, y: 400, width: 50, height: 50))],
            playable: ["a1"], in: CGRect(x: 0, y: 0, width: 300, height: 200))

        XCTAssertTrue(holes.isEmpty)
    }

    // MARK: - Un vocal se lance depuis l'aperçu quand la loi le laisse lire

    func test_mayPlayVoice_clearVoice_isTrue() {
        XCTAssertTrue(MessageOverlayPreviewTouch.mayPlayVoice(attachmentId: "a1", in: message([voice()])))
    }

    func test_mayPlayVoice_viewOnceMessage_isFalse() {
        XCTAssertFalse(MessageOverlayPreviewTouch.mayPlayVoice(attachmentId: "a1", in: message([voice()], viewOnce: true)))
    }

    func test_mayPlayVoice_blurredPiece_isFalse() {
        XCTAssertFalse(MessageOverlayPreviewTouch.mayPlayVoice(attachmentId: "a1", in: message([voice(isBlurred: true)])))
    }

    func test_mayPlayVoice_video_isNotAVoice() {
        XCTAssertFalse(MessageOverlayPreviewTouch.mayPlayVoice(attachmentId: "v1", in: message([video()])))
    }

    func test_mayPlayVoice_unknownPiece_isFalse() {
        XCTAssertFalse(MessageOverlayPreviewTouch.mayPlayVoice(attachmentId: "zz", in: message([voice()])))
    }

    // MARK: - La fermeture n'arrête que ce que l'aperçu a lancé

    func test_stopsOnClose_trackLaunchedByThePreview_stillPlaying_stops() {
        XCTAssertTrue(MessageOverlayPreviewTouch.stopsOnClose(previewPlayedAttachmentId: "a1", activeAttachmentId: "a1"))
    }

    func test_stopsOnClose_nothingLaunchedByThePreview_keepsTheThreadPlayback() {
        XCTAssertFalse(MessageOverlayPreviewTouch.stopsOnClose(previewPlayedAttachmentId: nil, activeAttachmentId: "a1"))
    }

    func test_stopsOnClose_anotherTrackNowPlaying_keepsIt() {
        XCTAssertFalse(MessageOverlayPreviewTouch.stopsOnClose(previewPlayedAttachmentId: "a1", activeAttachmentId: "a2"))
    }

    func test_stopsOnClose_coordinatorIdle_doesNothing() {
        XCTAssertFalse(MessageOverlayPreviewTouch.stopsOnClose(previewPlayedAttachmentId: "a1", activeAttachmentId: nil))
    }
}
