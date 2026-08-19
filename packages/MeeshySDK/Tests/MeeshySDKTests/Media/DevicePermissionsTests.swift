import AVFoundation
import Photos
import Speech
import XCTest
@testable import MeeshySDK

/// Behaviour of the pure status mapping that every permission call site keys
/// off. The `request…` helpers themselves hit TCC and cannot run in a unit
/// test, but every "should we prompt / should we redirect to Settings"
/// decision flows through these mappings — so they are the part worth pinning.
final class DevicePermissionsTests: XCTestCase {

    // MARK: - Capture (camera / microphone via AVFoundation)

    func test_state_fromCaptureStatus_mapsEveryCase() {
        XCTAssertEqual(MediaPermissionState(captureStatus: .notDetermined), .notDetermined)
        XCTAssertEqual(MediaPermissionState(captureStatus: .authorized), .granted)
        XCTAssertEqual(MediaPermissionState(captureStatus: .denied), .denied)
        XCTAssertEqual(MediaPermissionState(captureStatus: .restricted), .restricted)
    }

    // MARK: - Speech recognition

    func test_state_fromSpeechStatus_mapsEveryCase() {
        XCTAssertEqual(MediaPermissionState(speechStatus: .notDetermined), .notDetermined)
        XCTAssertEqual(MediaPermissionState(speechStatus: .authorized), .granted)
        XCTAssertEqual(MediaPermissionState(speechStatus: .denied), .denied)
        XCTAssertEqual(MediaPermissionState(speechStatus: .restricted), .restricted)
    }

    // MARK: - Photo library

    func test_state_fromPhotoStatus_mapsLimitedDistinctlyFromAuthorized() {
        XCTAssertEqual(MediaPermissionState(photoStatus: .notDetermined), .notDetermined)
        XCTAssertEqual(MediaPermissionState(photoStatus: .authorized), .granted)
        XCTAssertEqual(MediaPermissionState(photoStatus: .limited), .limited)
        XCTAssertEqual(MediaPermissionState(photoStatus: .denied), .denied)
        XCTAssertEqual(MediaPermissionState(photoStatus: .restricted), .restricted)
    }

    // MARK: - Derived decisions

    /// `.limited` is a GRANT for the photo library: the picker returns the
    /// user-selected subset. Treating it as a denial (the bug this guards)
    /// would show a "grant access" tile to someone who already granted.
    func test_isUsable_isTrueForGrantedAndLimitedOnly() {
        XCTAssertTrue(MediaPermissionState.granted.isUsable)
        XCTAssertTrue(MediaPermissionState.limited.isUsable)
        XCTAssertFalse(MediaPermissionState.notDetermined.isUsable)
        XCTAssertFalse(MediaPermissionState.denied.isUsable)
        XCTAssertFalse(MediaPermissionState.restricted.isUsable)
    }

    /// Only a terminal refusal warrants sending the user to Settings —
    /// `.notDetermined` must still be prompted in-app.
    func test_needsSettingsRedirect_isTrueForDeniedAndRestrictedOnly() {
        XCTAssertTrue(MediaPermissionState.denied.needsSettingsRedirect)
        XCTAssertTrue(MediaPermissionState.restricted.needsSettingsRedirect)
        XCTAssertFalse(MediaPermissionState.notDetermined.needsSettingsRedirect)
        XCTAssertFalse(MediaPermissionState.granted.needsSettingsRedirect)
        XCTAssertFalse(MediaPermissionState.limited.needsSettingsRedirect)
    }

    /// A prompt is worth showing exactly once — when nothing has been decided.
    func test_canPrompt_isTrueOnlyWhenNotDetermined() {
        XCTAssertTrue(MediaPermissionState.notDetermined.canPrompt)
        XCTAssertFalse(MediaPermissionState.granted.canPrompt)
        XCTAssertFalse(MediaPermissionState.limited.canPrompt)
        XCTAssertFalse(MediaPermissionState.denied.canPrompt)
        XCTAssertFalse(MediaPermissionState.restricted.canPrompt)
    }

    // MARK: - Live accessors

    /// The simulator/test host has no TCC decision recorded for capture
    /// devices, so these must report a real, non-crashing state rather than
    /// trapping. Value asserted loosely — the point is that the accessor is
    /// callable off the MainActor from any call site.
    func test_currentStates_areReadableWithoutPrompting() {
        XCTAssertNotNil(MediaPermissionState.camera.rawValue)
        XCTAssertNotNil(MediaPermissionState.microphone.rawValue)
        XCTAssertNotNil(MediaPermissionState.photoLibraryRead.rawValue)
        XCTAssertNotNil(MediaPermissionState.photoLibraryAdd.rawValue)
    }
}

/// `SFSpeechRecognizer.requestAuthorization` rappelle depuis `tccd`, hors main
/// actor. Sous `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, un closure littéral
/// qui lui est remis hérite `@MainActor` et son prologue trappe AU SITE
/// D'APPEL — crash device confirmé (`Meeshy-2026-07-11-020237.ips`). Le seul
/// endroit du SDK autorisé à passer ce closure est `DevicePermissions`, dont
/// tout le fichier est `nonisolated` et documente la doctrine.
final class SpeechAuthorizationIsolationSourceGuardTests: XCTestCase {

    private func sdkSources() throws -> [(path: String, text: String)] {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources")
        guard let walker = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil) else {
            throw XCTSkip("Arborescence Sources introuvable")
        }
        var files: [(String, String)] = []
        for case let url as URL in walker where url.pathExtension == "swift" {
            files.append((url.lastPathComponent, (try? String(contentsOf: url, encoding: .utf8)) ?? ""))
        }
        return files
    }

    func test_noSDKFileOtherThanDevicePermissions_passesAClosureLiteralToRequestAuthorization() throws {
        let offenders = try sdkSources()
            .filter { $0.path != "DevicePermissions.swift" }
            .filter { $0.text.contains("SFSpeechRecognizer.requestAuthorization {") }
            .map(\.path)

        XCTAssertTrue(
            offenders.isEmpty,
            "Ces fichiers remettent un closure littéral à SFSpeechRecognizer.requestAuthorization : " +
            "\(offenders). Passer par DevicePermissions.requestSpeechRecognition(), dont le " +
            "callback est confiné nonisolated — sinon l'assertion d'isolation trappe quand tccd rappelle."
        )
    }
}
