import Foundation
import Testing
@testable import MeeshyUI

@Suite("AudioTranscriptionReveal.shouldShowRevealCTA")
struct AudioTranscriptionRevealTests {

    @Test("no segments yet -> never shows the reveal CTA (nothing to reveal)")
    func test_noSegments_doesNotShowRevealCTA() {
        #expect(!AudioTranscriptionReveal.shouldShowRevealCTA(
            hasSegments: false,
            autoReveal: false,
            manuallyRevealed: false
        ))
    }

    @Test("segments present, auto-reveal off, not yet revealed -> shows the CTA")
    func test_segmentsPresent_autoRevealOff_notRevealed_showsRevealCTA() {
        #expect(AudioTranscriptionReveal.shouldShowRevealCTA(
            hasSegments: true,
            autoReveal: false,
            manuallyRevealed: false
        ))
    }

    @Test("segments present, auto-reveal on -> never shows the CTA (unchanged default behavior)")
    func test_segmentsPresent_autoRevealOn_doesNotShowRevealCTA() {
        #expect(!AudioTranscriptionReveal.shouldShowRevealCTA(
            hasSegments: true,
            autoReveal: true,
            manuallyRevealed: false
        ))
    }

    @Test("segments present, auto-reveal off, but already manually revealed -> CTA stays down")
    func test_segmentsPresent_autoRevealOff_manuallyRevealed_doesNotShowRevealCTA() {
        #expect(!AudioTranscriptionReveal.shouldShowRevealCTA(
            hasSegments: true,
            autoReveal: false,
            manuallyRevealed: true
        ))
    }
}

/// **Garde de câblage — le booléen doit atteindre le PIXEL.**
///
/// Même patron que `AudioTranscriptionReserveWiringGuardTests` : la règle pure
/// peut être juste et n'avoir corrigé personne si `transcriptionBlock` ne
/// l'appelle pas. Aucun test de comportement ne peut observer la branche
/// SwiftUI sans instancier l'arbre, donc la garde lit la SOURCE.
@Suite("AudioPlayerView — câblage de autoRevealTranscription")
struct AudioTranscriptionRevealWiringGuardTests {

    private static var packageRoot: URL {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<4 { url.deleteLastPathComponent() }
        return url
    }

    private func transcriptionSource() throws -> String {
        let url = Self.packageRoot
            .appendingPathComponent("Sources/MeeshyUI/Media/AudioPlayerView+Transcription.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    @Test("transcriptionBlock consulte AudioTranscriptionReveal.shouldShowRevealCTA")
    func test_transcriptionBlock_readsRevealHelper() throws {
        let source = try transcriptionSource()
        #expect(source.contains("AudioTranscriptionReveal.shouldShowRevealCTA"),
                "transcriptionBlock n'appelle plus la règle pure — l'opt-out d'affichage #4956 est mort")
    }

    @Test("le tap du CTA de révélation ne déclenche aucune requête réseau")
    func test_revealCTA_neverCallsOnRequestTranscription() throws {
        let lines = try transcriptionSource()
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map(String.init)
        guard let start = lines.firstIndex(where: { $0.contains("AudioTranscriptionReveal.shouldShowRevealCTA(") }),
              let end = lines[start...].firstIndex(where: { $0.contains("} else if !displaySegments.isEmpty {") })
        else {
            Issue.record("branche du CTA de révélation introuvable")
            return
        }
        let branch = lines[start..<end].joined(separator: "\n")
        #expect(!branch.contains("onRequest"),
                "le CTA de révélation ne doit jamais appeler onRequestTranscription — la transcription existe déjà")
        #expect(branch.contains("hasManuallyRevealedTranscription = true"),
                "le tap doit poser hasManuallyRevealedTranscription pour révéler durablement")
    }
}
