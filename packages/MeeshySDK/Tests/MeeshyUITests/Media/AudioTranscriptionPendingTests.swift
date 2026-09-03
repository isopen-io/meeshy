import Foundation
import Testing
@testable import MeeshyUI

@Suite("AudioTranscriptionPending.shouldReserveHeight")
struct AudioTranscriptionPendingTests {

    private let now = Date(timeIntervalSince1970: 1_000_000)

    @Test("recent audio, no transcription -> reserves height")
    func test_recentNoTranscription_reservesHeight() {
        #expect(AudioTranscriptionPending.shouldReserveHeight(
            hasTranscription: false,
            receivedAt: now.addingTimeInterval(-5),
            now: now,
            isLocalDraft: false
        ))
    }

    @Test("just inside the nominal timeout -> still reserves")
    func test_justInsideNominalTimeout_reservesHeight() {
        let receivedAt = now.addingTimeInterval(-(AudioTranscriptionPending.nominalTimeout - 1))
        #expect(AudioTranscriptionPending.shouldReserveHeight(
            hasTranscription: false,
            receivedAt: receivedAt,
            now: now,
            isLocalDraft: false
        ))
    }

    @Test("transcription already present -> never reserves, however recent")
    func test_hasTranscription_doesNotReserveHeight() {
        #expect(!AudioTranscriptionPending.shouldReserveHeight(
            hasTranscription: true,
            receivedAt: now.addingTimeInterval(-1),
            now: now,
            isLocalDraft: false
        ))
    }

    @Test("older than the nominal Whisper timeout -> stops reserving (no eternal shimmer)")
    func test_olderThanNominalTimeout_doesNotReserveHeight() {
        let receivedAt = now.addingTimeInterval(-(AudioTranscriptionPending.nominalTimeout + 1))
        #expect(!AudioTranscriptionPending.shouldReserveHeight(
            hasTranscription: false,
            receivedAt: receivedAt,
            now: now,
            isLocalDraft: false
        ))
    }

    @Test("exactly at the nominal timeout boundary -> false (strict <)")
    func test_exactlyAtNominalTimeout_doesNotReserveHeight() {
        let receivedAt = now.addingTimeInterval(-AudioTranscriptionPending.nominalTimeout)
        #expect(!AudioTranscriptionPending.shouldReserveHeight(
            hasTranscription: false,
            receivedAt: receivedAt,
            now: now,
            isLocalDraft: false
        ))
    }

    @Test("local optimistic draft -> never reserves, however recent")
    func test_localDraft_doesNotReserveHeight() {
        #expect(!AudioTranscriptionPending.shouldReserveHeight(
            hasTranscription: false,
            receivedAt: now,
            now: now,
            isLocalDraft: true
        ))
    }

    /// Une pièce jointe horodatée dans le FUTUR (dérive d'horloge entre le
    /// serveur et l'appareil) reste dans la fenêtre : l'écart est négatif,
    /// donc strictement inférieur au délai. Le témoin l'épingle parce qu'une
    /// écriture en valeur absolue le renverrait à `false` — un vocal reçu à
    /// l'instant perdrait sa réservation pour une seconde de dérive.
    @Test("horloge en avance (receivedAt dans le futur) -> réserve quand même")
    func test_futureTimestamp_reservesHeight() {
        #expect(AudioTranscriptionPending.shouldReserveHeight(
            hasTranscription: false,
            receivedAt: now.addingTimeInterval(30),
            now: now,
            isLocalDraft: false
        ))
    }
}

/// **Garde de câblage — le booléen doit atteindre le PIXEL.**
///
/// `shouldReserveHeight` peut être juste et n'avoir corrigé personne si
/// `transcriptionBlock` ne le lit pas (leçon « qui AFFICHE ce que le résolveur
/// élit ? »). Le shimmer n'est rendu que par une vue SwiftUI, donc aucun test
/// de comportement ne peut l'observer sans instancier l'arbre : la garde lit
/// la SOURCE, comme `ComposerSourceGuard` le fait pour le composer.
@Suite("AudioPlayerView — câblage de reserveTranscriptionHeight")
struct AudioTranscriptionReserveWiringGuardTests {

    /// `Tests/MeeshyUITests/Media/<ce fichier>` → 4 composants sous la racine
    /// du package (même dérivation que `ComposerSourceGuard.packageRoot`, qui
    /// vit un niveau plus bas et en remonte 5).
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

    /// Première condition rencontrée APRÈS la déclaration de
    /// `transcriptionBlock` — l'ancrage sur la déclaration, plutôt que sur la
    /// première occurrence du fichier, évite que la garde bascule sur
    /// `flatTranscriptionBlock` (tenue plate, hors périmètre) si l'ordre des
    /// membres change.
    private func shimmerCondition(in code: String) -> String? {
        let lines = code
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map { $0.trimmingCharacters(in: .whitespaces) }
        guard let start = lines.firstIndex(where: { $0.hasPrefix("var transcriptionBlock") }) else {
            return nil
        }
        return lines[start...].first { $0.hasPrefix("if ") && $0.contains("displaySegments.isEmpty") }
    }

    @Test("la branche shimmer de transcriptionBlock lit reserveTranscriptionHeight")
    func test_transcriptionBlock_shimmerBranch_readsReserveFlag() throws {
        let condition = shimmerCondition(in: try transcriptionSource())
        #expect(condition != nil, "la branche shimmer de transcriptionBlock est introuvable")
        #expect(condition?.contains("reserveTranscriptionHeight") == true,
                "le shimmer ignore reserveTranscriptionHeight : la règle ne réserve plus rien")
        #expect(condition?.contains("isTranscribing") == true,
                "le tap « Transcrire » local doit continuer d'ouvrir le shimmer")
    }
}
