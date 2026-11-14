import XCTest
import MeeshyUI
@testable import Meeshy

/// **Le bouton de lecture d'un vocal en attente lit, met en pause et reprend —
/// sans ouvrir l'éditeur** (#7171, décision porteur du 2026-11-14).
///
/// Le composeur n'a qu'un lecteur pour toutes ses tuiles : la loi décide, pour
/// la tuile touchée, si l'on démarre son fichier, si l'on met en pause ce qui
/// joue, ou si l'on reprend ce qui est en pause.
final class PendingAudioPlaybackActionTests: XCTestCase {

    func test_nothingLoaded_startsTheTappedNote() {
        XCTAssertEqual(
            PendingAudioPlaybackAction.resolve(isPlaying: false, isLoaded: false, loadedAttachmentId: nil, tappedAttachmentId: "a"),
            .start
        )
    }

    func test_anotherNotePlaying_startsTheTappedOne() {
        XCTAssertEqual(
            PendingAudioPlaybackAction.resolve(isPlaying: true, isLoaded: true, loadedAttachmentId: "b", tappedAttachmentId: "a"),
            .start,
            "le lecteur unique passe au vocal touché"
        )
    }

    func test_tappedNotePlaying_pauses() {
        XCTAssertEqual(
            PendingAudioPlaybackAction.resolve(isPlaying: true, isLoaded: true, loadedAttachmentId: "a", tappedAttachmentId: "a"),
            .pause
        )
    }

    func test_tappedNotePaused_resumesWhereItStopped() {
        XCTAssertEqual(
            PendingAudioPlaybackAction.resolve(isPlaying: false, isLoaded: true, loadedAttachmentId: "a", tappedAttachmentId: "a"),
            .resume
        )
    }

    func test_tappedNoteStopped_restartsFromItsFile() {
        XCTAssertEqual(
            PendingAudioPlaybackAction.resolve(isPlaying: false, isLoaded: false, loadedAttachmentId: "a", tappedAttachmentId: "a"),
            .start,
            "un lecteur arrêté garde l'identifiant mais plus le son : reprendre ne jouerait rien"
        )
    }
}

/// **L'exécution de la loi sur le lecteur du composeur.** Un démarrage désigne
/// d'abord le vocal au lecteur (c'est ce que la tuile et la commande lisent
/// pour dessiner « lecture » pour CE vocal), puis joue son fichier.
@MainActor
final class PendingAudioPlaybackTests: XCTestCase {

    func test_start_namesTheTappedNoteToThePlayer_beforePlayingItsFile() {
        let player = AudioPlaybackManager(registerWithCoordinator: false)
        let sut = PendingAudioPlayback(player: player)

        sut.toggle(attachmentId: "a", fileURL: URL(fileURLWithPath: "/nonexistent/vocal.m4a"))

        XCTAssertEqual(player.attachmentId, "a")
        XCTAssertFalse(player.isPlaying, "le fichier n'existe pas : le lecteur reste silencieux, sans planter")
    }

    func test_start_withoutAFile_doesNothing() {
        let player = AudioPlaybackManager(registerWithCoordinator: false)
        let sut = PendingAudioPlayback(player: player)

        sut.toggle(attachmentId: "a", fileURL: nil)

        XCTAssertNil(player.attachmentId)
    }
}

/// **La commande est posée À CÔTÉ du toucher qui édite, jamais dedans** : un
/// bouton dans le libellé d'un autre bouton rendrait le geste ambigu. Et la
/// tuile dessine « lecture » pour CE vocal seulement.
final class PendingAudioTileWiringSourceGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let iosRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
        let raw = try String(contentsOf: iosRoot.appendingPathComponent(relativePath), encoding: .utf8)
        return AppSourceGuard.stripComments(raw)
    }

    func test_theTile_hostsItsControlBesideTheTapSurface() throws {
        let tile = try source("Meeshy/Features/Main/Components/ComposerAttachmentZone.swift")
        XCTAssertTrue(tile.contains("struct ComposerAttachmentTile<Control: View>"), "la commande est un emplacement typé, pas un AnyView")
        XCTAssertTrue(tile.contains("control\n                    .frame(width: Self.side, height: Self.side)"), "la commande occupe la tuile, au centre, en sœur du bouton d'édition")
    }

    func test_theConversationTile_wiresTheKitButton_andDrawsPlaybackForThisNoteOnly() throws {
        let tile = try source("Meeshy/Features/Main/Views/ConversationPendingAttachmentTile.swift")
        XCTAssertTrue(tile.contains("MeeshyGlassButton("), "la commande est le bouton rond du kit (K02)")
        XCTAssertTrue(tile.contains("player.attachmentId == attachment.id"), "l'onde s'anime pour CE vocal")
        XCTAssertTrue(tile.contains("player.attachmentId == attachmentId"), "la commande dit « pause » pour CE vocal")
        XCTAssertTrue(tile.contains("centerGlyph: isAudio ? nil :"), "le crayon s'efface devant la commande")
    }

    func test_theConversationRoot_handsTheToggleToTheLaw() throws {
        let host = try source("Meeshy/Features/Main/Views/ConversationView+ComposerAttachments.swift")
        XCTAssertTrue(host.contains("PendingAudioPlayback(player: pendingAudioPlayer)"), "le toucher passe par la loi, pas par un `if` local")
    }

    func test_sendingThePlateau_silencesThePendingPlayer() throws {
        let handlers = try source("Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift")
        XCTAssertTrue(handlers.contains("pendingAudioPlayer.stop()"), "un vocal parti ne continue pas de jouer depuis le composeur")
    }
}
