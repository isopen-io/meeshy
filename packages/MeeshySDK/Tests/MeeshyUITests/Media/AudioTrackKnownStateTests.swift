import XCTest
import AVFoundation
@testable import MeeshyUI

/// **Un lecteur ne relit jamais l'état d'une piste sur le fil principal**
/// (#18511) : `-[AVPlayerItemTrack isEnabled]` est un aller-retour synchrone
/// vers le serveur média, relevé à 0,62 s sur le fil des réels. L'élément porte
/// l'état que Meeshy lui a écrit ; un élément vierge a ses pistes allumées.
final class AudioTrackKnownStateTests: XCTestCase {

    private typealias Law = AudioTrackActivationLaw

    func test_trackWrite_pristineItemMuted_switchesTheAudioOff() {
        XCTAssertEqual(Law.trackWrite(appliedMuted: nil, effectiveMuted: true), false)
    }

    func test_trackWrite_pristineItemAudible_writesNothing() {
        XCTAssertNil(Law.trackWrite(appliedMuted: nil, effectiveMuted: false))
    }

    func test_trackWrite_alreadyInTheWantedState_writesNothing() {
        XCTAssertNil(Law.trackWrite(appliedMuted: true, effectiveMuted: true))
        XCTAssertNil(Law.trackWrite(appliedMuted: false, effectiveMuted: false))
    }

    func test_trackWrite_unmutingAMutedItem_switchesTheAudioOn() {
        XCTAssertEqual(Law.trackWrite(appliedMuted: true, effectiveMuted: false), true)
    }

    func test_activator_neverReadsTheEnabledFlagOfATrack() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Media/AudioTrackActivator.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        XCTAssertNil(source.range(of: #"\.isEnabled(?!\s*=[^=])"#, options: .regularExpression),
                     "lire isEnabled bloque le fil principal sur le serveur média")
    }
}

/// **Le lecteur de stories ne relit plus la session audio** (#18511) : chaque
/// lecture de `AVAudioSession` est un aller-retour synchrone ; la session se
/// demande au coordinateur, qui la connaît ou la relit sur sa file.
final class StoryReaderSessionReadGuardTests: XCTestCase {

    func test_storyCanvas_neverReadsTheSharedAudioSession() throws {
        let canvas = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Story/Canvas")
        let files = try XCTUnwrap(FileManager.default.enumerator(at: canvas, includingPropertiesForKeys: nil))
            .compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" }
        XCTAssertFalse(files.isEmpty)
        for file in files {
            let source = try String(contentsOf: file, encoding: .utf8)
            XCTAssertFalse(source.contains("AVAudioSession.sharedInstance()"),
                           "\(file.lastPathComponent) relit la session sur le fil principal")
        }
    }
}
