import XCTest
@testable import Meeshy

/// **L'appui long sur la photothèque ouvre la caméra** (#10306, directive
/// porteur 2026-10-12) — le toucher bref reste la photothèque.
final class ComposerRailDoorLongPressTests: XCTestCase {

    // MARK: - Ce que l'appui long ouvre

    func test_longPressIntake_mediaDoor_opensTheCamera() {
        XCTAssertEqual(ComposerMediaSourcePolicy.longPressIntake(for: .media), .camera)
    }

    func test_longPressIntake_everyOtherDoor_hasNone() {
        for door in ComposerRailDoor.allCases where door != .media {
            XCTAssertNil(ComposerMediaSourcePolicy.longPressIntake(for: door), "\(door) n'a pas d'appui long")
        }
    }

    func test_railDoorIntake_shortTap_staysThePhotoLibrary() {
        XCTAssertEqual(ComposerMediaSourcePolicy.railDoorIntake, .photoLibrary, "le toucher bref ne change pas")
    }

    func test_openCameraAction_isNamed() {
        XCTAssertFalse(ComposerMediaSourcePolicy.openCameraAction.isEmpty)
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

    func test_rail_offersTheLongPressAsANamedVoiceOverAction() throws {
        let rail = try Self.source("ComposerLeadingRail.swift")
        XCTAssertTrue(rail.contains("LongPressGesture(minimumDuration: ComposerRailDoorPress.minimumDuration)"))
        XCTAssertTrue(rail.contains("Button(ComposerMediaSourcePolicy.openCameraAction)"),
                      "VoiceOver reçoit l'appui long en action nommée")
        XCTAssertTrue(rail.contains("press.admitsTap(id: id, at: Date()) else { return }"))
    }

    func test_host_longPressArmsTheSceneCamera() throws {
        let hote = try Self.source("MeeshyComposerHost+Viewfinder.swift")
        guard let debut = hote.range(of: "func handleRailDoorLongPress"),
              let fin = hote.range(of: "armSceneCamera()", range: debut.upperBound..<hote.endIndex) else {
            return XCTFail("l'appui long de la porte n'arme pas le viseur de la scène")
        }
        XCTAssertFalse(hote[debut.upperBound..<fin.lowerBound].contains("beginHold"),
                       "l'appui long ARME la caméra, il ne filme pas")
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
