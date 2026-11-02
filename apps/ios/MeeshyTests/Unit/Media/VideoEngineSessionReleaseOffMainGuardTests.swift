import XCTest

/// **Quitter une vidéo ne rend plus la session audio sur le fil principal**
/// (#12423, « en reculant en arrière ça fige parfois »).
///
/// Fermer la galerie plein écran sur une vidéo libère le moteur partagé :
/// `release(urlString:)` → `stop()` → `setActive(false)`. Ce dernier est un
/// aller-retour BLOQUANT vers le serveur audio, et sous un lecteur qui vient
/// d'être mis en pause il attend que ses entrées-sorties s'arrêtent. Mesuré au
/// simulateur le 2026-10-23 : `-[AVAudioSession privateSetActive:…]` sur le fil
/// principal, sous `GalleryVideoPage.stageDragGesture`, et un avertissement
/// système « AVAudioSession Hang Risk — This method can lead to UI
/// unresponsiveness if called on the main thread » à CHAQUE fermeture.
///
/// La désactivation part donc par `deactivatePlaybackDeferred()`, hors du fil
/// principal, et une prise de session survenue entre-temps l'efface
/// (`MediaSessionDeferredDeactivationTests`). Les deux arrêts du moteur sont
/// gardés : `stop()` (fermeture, PiP, libération d'une surface) et
/// `stopForHandoff()` (un autre lecteur prend la main).
final class VideoEngineSessionReleaseOffMainGuardTests: XCTestCase {

    private var moteur: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Media/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .deletingLastPathComponent()   // apps/
            .deletingLastPathComponent()   // racine du dépôt
            .appendingPathComponent("packages/MeeshySDK/Sources/MeeshyUI/Media/SharedAVPlayerManager.swift")
    }

    private func corps(de signature: String, dans code: String) throws -> String {
        let debut = try XCTUnwrap(code.range(of: signature), "\(signature) introuvable")
        let suite = code[debut.upperBound...]
        let fin = suite.range(of: "\n    }\n")?.lowerBound ?? suite.endIndex
        return String(suite[..<fin])
    }

    func test_stop_rendLaSessionHorsDuFilPrincipal() throws {
        let code = try String(contentsOf: moteur, encoding: .utf8)
        let stop = try corps(de: "public func stop() {", dans: code)
        XCTAssertFalse(stop.contains("deactivatePlaybackSync()"),
                       "stop() bloque le fil principal sur setActive(false) — la galerie se fige en se fermant")
        XCTAssertTrue(stop.contains("deactivatePlaybackDeferred()"))
    }

    func test_stopForHandoff_rendLaSessionHorsDuFilPrincipal() throws {
        let code = try String(contentsOf: moteur, encoding: .utf8)
        let handoff = try corps(de: "public func stopForHandoff() {", dans: code)
        XCTAssertFalse(handoff.contains("deactivatePlaybackSync()"),
                       "stopForHandoff() bloque le fil principal sur setActive(false)")
        XCTAssertTrue(handoff.contains("deactivatePlaybackDeferred()"))
    }
}
