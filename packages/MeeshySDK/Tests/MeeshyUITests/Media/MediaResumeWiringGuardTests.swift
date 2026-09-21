import XCTest
@testable import MeeshyUI

/// **Ce que le lecteur ANNONCE doit être ce que le moteur APPLIQUE (#7212).**
///
/// La première version de ce lot faisait descendre la position servie dans
/// `AudioPlayerView.eligibleResumePosition` — le timecode de la bulle — et
/// laissait `applyResumePositionIfAvailable`, le seul site qui DÉPLACE la tête
/// de lecture, lire le magasin local seul. Une bulle jamais ouverte sur cet
/// appareil affichait donc « 0:45 » au-dessus d'une lecture qui démarrait à
/// 0:00 : un contrôle qui MENT, pire que la reprise absente qu'on corrigeait,
/// et invisible à tout témoin de la fonction pure.
///
/// Ces gardes lisent la SOURCE parce que le geste qu'elles protègent — un
/// `AVAudioPlayer.currentTime` / un `seek` — n'est pas atteignable sans moteur
/// réel. Elles ne prouvent pas la valeur (les témoins de
/// `MediaResumeResolverTests` s'en chargent) : elles prouvent que les sites qui
/// AGISSENT passent par elle, et que la valeur servie leur est bien REMISE.
final class MediaResumeWiringGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Media/
            .deletingLastPathComponent()   // MeeshyUITests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_leMoteurAudioResoutSaRepriseParLeResolveurPartage() throws {
        let text = try source("Sources/MeeshyUI/Media/AudioPlaybackManager.swift")
        XCTAssertTrue(
            text.contains("MediaResumeResolver.resumePosition("),
            "Le seek audio doit résoudre sa reprise par MediaResumeResolver — "
            + "sinon la bulle annonce une position que la lecture ignore.")
        XCTAssertTrue(
            text.contains("medium: .audio"),
            "Le moteur audio doit lire la paire de champs AUDIO de la consommation servie.")
    }

    func test_leMoteurVideoResoutSaRepriseParLeResolveurPartage() throws {
        let text = try source("Sources/MeeshyUI/Media/SharedAVPlayerManager.swift")
        XCTAssertTrue(
            text.contains("MediaResumeResolver.resumePosition("),
            "Le seek vidéo doit résoudre sa reprise par MediaResumeResolver.")
        XCTAssertTrue(
            text.contains("medium: .video"),
            "Le moteur vidéo doit lire la paire `lastWatchPositionMs` / `watchedComplete`.")
    }

    func test_laVueRemetLaConsommationServieAuMoteur() throws {
        let text = try source("Sources/MeeshyUI/Media/AudioPlayerView.swift")
        XCTAssertTrue(
            text.contains("player.setServedConsumption(attachment.currentUserConsumption, for: attachment.id)"),
            "Un champ DÉCLARÉ et jamais ALIMENTÉ ne corrige personne : la vue doit "
            + "remettre `currentUserConsumption` au moteur.")
        XCTAssertTrue(
            text.contains("publishServedConsumption()"),
            "Le relais doit être APPELÉ — à l'apparition et juste avant la lecture.")
    }

    func test_leChargementVideoTransporteLaConsommationServie() throws {
        let text = try source("Sources/MeeshyUI/Media/MeeshyVideoPlayer+Renderers.swift")
        XCTAssertTrue(
            text.contains("servedConsumption: player.attachment.currentUserConsumption"),
            "La consommation servie voyage AVEC l'identifiant qu'elle qualifie, "
            + "par le paramètre de `load(urlString:attachmentId:servedConsumption:)`.")
    }
}
