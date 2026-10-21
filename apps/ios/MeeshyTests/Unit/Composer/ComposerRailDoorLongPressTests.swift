import XCTest
@testable import Meeshy

/// **L'appui long sur la photothèque propose « Prendre une photo » ou « Depuis
/// les fichiers »** (#10357, retour porteur 2026-10-12, qui remplace l'armement
/// direct de la caméra de #10306) — le toucher bref reste la photothèque.
final class ComposerRailDoorLongPressTests: XCTestCase {

    // MARK: - Ce que l'appui long propose

    func test_longPressSources_mediaDoor_cameraServed_offersCameraThenFiles() {
        XCTAssertEqual(ComposerMediaSourcePolicy.longPressSources(for: .media, cameraServed: true),
                       [.camera, .files])
    }

    func test_longPressSources_mediaDoor_cameraNotServed_offersFilesOnly() {
        XCTAssertEqual(ComposerMediaSourcePolicy.longPressSources(for: .media, cameraServed: false),
                       [.files], "un format sans caméra garde l'import de fichiers")
    }

    func test_longPressSources_everyOtherDoor_hasNone() {
        for door in ComposerRailDoor.allCases where door != .media {
            XCTAssertFalse(ComposerMediaSourcePolicy.offersLongPress(door), "\(door) n'a pas d'appui long")
            XCTAssertEqual(ComposerMediaSourcePolicy.longPressSources(for: door, cameraServed: true), [],
                           "\(door) ne propose rien")
        }
    }

    func test_railDoorIntake_shortTap_staysThePhotoLibrary() {
        XCTAssertEqual(ComposerMediaSourcePolicy.railDoorIntake, .photoLibrary, "le toucher bref ne change pas")
    }

    func test_longPressLabels_areNamedAndDistinct() {
        let camera = ComposerMediaSourcePolicy.longPressLabel(.camera)
        let fichiers = ComposerMediaSourcePolicy.longPressLabel(.files)
        XCTAssertFalse(camera.isEmpty)
        XCTAssertFalse(fichiers.isEmpty)
        XCTAssertNotEqual(camera, fichiers, "VoiceOver distingue les deux actions")
    }

    func test_longPressLabels_areTranslatedInSevenLocales() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Localizable.xcstrings")
        let json = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
        let strings = json?["strings"] as? [String: Any]
        for key in ["composer.rail.media.takePhoto", "composer.rail.media.fromFiles"] {
            let locs = (strings?[key] as? [String: Any])?["localizations"] as? [String: Any]
            for loc in ["ar", "de", "en", "es", "fr", "it", "pt-BR"] {
                XCTAssertNotNil(locs?[loc], "« \(key) » : locale « \(loc) » manquante")
            }
        }
        XCTAssertNil(strings?["composer.rail.media.openCamera"], "l'ancienne action n'a plus de lecteur")
    }

    // MARK: - La levée de l'appui long n'ouvre pas la photothèque

    func test_admitsTap_withoutLongPress_passes() {
        var press = ComposerRailDoorPress()
        XCTAssertTrue(press.admitsTap(id: "media", at: Date()))
    }

    func test_admitsTap_releaseRightAfterLongPress_isSwallowed() {
        var press = ComposerRailDoorPress()
        let instant = Date()
        press.noteLongPress(id: "media", at: instant)
        XCTAssertFalse(press.admitsTap(id: "media", at: instant.addingTimeInterval(0.3)))
    }

    func test_admitsTap_theFollowingTap_passesAgain() {
        var press = ComposerRailDoorPress()
        let instant = Date()
        press.noteLongPress(id: "media", at: instant)
        _ = press.admitsTap(id: "media", at: instant.addingTimeInterval(0.3))
        XCTAssertTrue(press.admitsTap(id: "media", at: instant.addingTimeInterval(1)))
    }

    func test_admitsTap_anotherDoor_passes() {
        var press = ComposerRailDoorPress()
        let instant = Date()
        press.noteLongPress(id: "media", at: instant)
        XCTAssertTrue(press.admitsTap(id: "sound", at: instant.addingTimeInterval(0.3)))
    }

    func test_admitsTap_longAfterTheLongPress_passes() {
        var press = ComposerRailDoorPress()
        let instant = Date()
        press.noteLongPress(id: "media", at: instant)
        let plusTard = instant.addingTimeInterval(ComposerRailDoorPress.releaseWindow + 1)
        XCTAssertTrue(press.admitsTap(id: "media", at: plusTard), "le doigt a quitté la porte : nouveau geste")
    }

    // MARK: - Le câblage

    func test_rail_offersEachSourceAsANamedVoiceOverAction() throws {
        let rail = try Self.source("ComposerLeadingRail.swift")
        XCTAssertTrue(rail.contains("LongPressGesture(minimumDuration: ComposerRailDoorPress.minimumDuration)"))
        XCTAssertTrue(rail.contains("longPress.begin()"), "l'appui long présente le choix")
        XCTAssertTrue(rail.contains("ForEach(longPress.actions.map { named in"),
                      "VoiceOver reçoit chaque source en action nommée")
        XCTAssertTrue(rail.contains("label: ComposerMediaSourcePolicy.longPressLabel(source)"))
        XCTAssertTrue(rail.contains("press.admitsTap(id: id, at: Date()) else { return }"))
    }

    func test_host_longPressPresentsTheChoice_thenOpensTheChosenSource() throws {
        let hote = try Self.source("MeeshyComposerHost+Viewfinder.swift")
        guard let debut = hote.range(of: "func handleRailDoorLongPress"),
              let fin = hote.range(of: "func chooseRailLongPressSource", range: debut.upperBound..<hote.endIndex) else {
            return XCTFail("l'appui long de la porte ne présente plus de choix")
        }
        let offre = hote[debut.upperBound..<fin.lowerBound]
        XCTAssertTrue(offre.contains("railLongPressSources = sources"), "l'appui long présente le choix")
        XCTAssertFalse(offre.contains("armSceneCamera()"), "l'appui long n'arme plus la caméra de lui-même")
        guard let finChoix = hote.range(of: "func handleSceneCaptureLongPressChanged",
                                        range: fin.upperBound..<hote.endIndex) else {
            return XCTFail("la fin du choix est introuvable — la garde ne mesurerait rien")
        }
        let choix = hote[fin.upperBound..<finChoix.lowerBound]
        XCTAssertTrue(choix.contains("case .camera:"))
        XCTAssertTrue(choix.contains("armSceneCamera()"), "« Prendre une photo » arme le viseur de la scène")
        XCTAssertFalse(choix.contains("beginHold"), "l'appui long ARME la caméra, il ne filme pas")
        XCTAssertTrue(choix.contains("fileImportIntent = .media"), "« Depuis les fichiers » filtre les médias")
        XCTAssertTrue(choix.contains("presentMediaIntake(.files)"), "« Depuis les fichiers » ouvre l'importateur")
        let portails = try Self.source("MeeshyComposerHost+Portals.swift")
        XCTAssertTrue(portails.contains("presenting: railLongPressSources"), "le choix est monté avec les portails")
        XCTAssertTrue(portails.contains("chooseRailLongPressSource(source)"))
        let surfaces = try Self.source("MeeshyComposerHost+Surfaces.swift")
        XCTAssertTrue(surfaces.contains("onRailDoorLongPress: railDoorLongPress"))
    }

    private static func source(_ name: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/\(name)")
        return try String(contentsOf: url, encoding: .utf8)
    }
}
