import XCTest
@testable import Meeshy
import MeeshySDK

/// **Les images et vidéos reçues s'enregistrent seules, une seule fois, dans
/// l'album Meeshy** (#8307, directive porteur 2026-09-27) — jamais un média
/// éphémère, flamme-œil, flouté, à vue unique ou chiffré ; interrupteur dans
/// Réglages › Médias, actif par défaut.
@MainActor
final class ReceivedMediaAutoSaverTests: XCTestCase {

    // MARK: - Fabriques

    private func photo(_ id: String = "p1", isBlurred: Bool = false, isViewOnce: Bool = false) -> MessageAttachment {
        MessageAttachment(id: id, messageId: "m1", fileName: "p.jpg", mimeType: "image/jpeg",
                          fileUrl: "https://staging.meeshy.me/\(id).jpg", isViewOnce: isViewOnce, isBlurred: isBlurred)
    }

    private func video(_ id: String = "v1") -> MessageAttachment {
        MessageAttachment(id: id, messageId: "m1", fileName: "v.mp4", mimeType: "video/mp4",
                          fileUrl: "https://staging.meeshy.me/\(id).mp4")
    }

    private func audio() -> MessageAttachment {
        MessageAttachment(id: "a1", messageId: "m1", fileName: "a.m4a", mimeType: "audio/mp4",
                          fileUrl: "https://staging.meeshy.me/a.m4a")
    }

    private func message(_ attachments: [MessageAttachment], isMe: Bool = false,
                         flags: MessageEffectFlags = []) -> Message {
        var message = Message(id: "m1", conversationId: "c1", senderId: isMe ? "me" : "autre",
                              content: "", attachments: attachments, isMe: isMe)
        message.effects.flags = flags
        return message
    }

    private func makeSUT(enabled: Bool = true, active: Bool = true, allowed: Bool = true,
                         outcome: ReceivedMediaSaveOutcome = .saved)
        -> (sut: ReceivedMediaAutoSaver, writer: SpyAlbumWriter, registry: AutoSavedAttachmentRegistry) {
        let writer = SpyAlbumWriter(outcome: outcome)
        let registry = AutoSavedAttachmentRegistry(defaults: UserDefaults(suiteName: "autosave-\(UUID().uuidString)")!)
        let sut = ReceivedMediaAutoSaver(isActive: active,
                                         setting: StubAutoSaveSetting(isEnabled: enabled),
                                         registry: registry, writer: writer,
                                         downloadAllowed: { _ in allowed })
        return (sut, writer, registry)
    }

    private func settle() async {
        for _ in 0..<5 { await Task.yield(); try? await Task.sleep(nanoseconds: 10_000_000) }
    }

    // MARK: - La règle

    func test_policy_imageEtVidéoReçues_sontÉligibles_pasLAudio() {
        let eligible = ReceivedMediaAutoSavePolicy.eligibleMedia(in: message([photo(), video(), audio()]))
        XCTAssertEqual(eligible.map(\.id), ["p1", "v1"])
    }

    func test_policy_monPropreMessage_nEstJamaisEnregistré() {
        XCTAssertTrue(ReceivedMediaAutoSavePolicy.eligibleMedia(in: message([photo()], isMe: true)).isEmpty)
    }

    func test_policy_messageProtégé_nEstJamaisEnregistré() {
        for flags: MessageEffectFlags in [.blurred, .viewOnce, .ephemeral, [.ephemeral, .ephemeralAfterRead]] {
            XCTAssertTrue(ReceivedMediaAutoSavePolicy.eligibleMedia(in: message([photo()], flags: flags)).isEmpty,
                          "flags \(flags.rawValue)")
        }
    }

    func test_policy_pièceProtégée_nEstJamaisEnregistrée() {
        let eligible = ReceivedMediaAutoSavePolicy.eligibleMedia(
            in: message([photo("flou", isBlurred: true), photo("unique", isViewOnce: true), photo("net")]))
        XCTAssertEqual(eligible.map(\.id), ["net"])
    }

    // MARK: - L'orchestrateur

    func test_consider_enregistreUneSeuleFoisParPièce() async {
        let (sut, writer, _) = makeSUT()

        sut.consider([message([photo()])])
        sut.consider([message([photo()])])
        await settle()

        XCTAssertEqual(writer.savedIds, ["p1"], "le socket et l'ouverture revoient la même pièce : un seul enregistrement")
    }

    func test_consider_interrupteurCoupé_nEnregistreRien() async {
        let (sut, writer, _) = makeSUT(enabled: false)
        sut.consider([message([photo()])])
        await settle()
        XCTAssertTrue(writer.savedIds.isEmpty)
    }

    func test_consider_horsSession_nEnregistreRien() async {
        let (sut, writer, _) = makeSUT(active: false)
        sut.consider([message([photo()])])
        await settle()
        XCTAssertTrue(writer.savedIds.isEmpty)
    }

    func test_consider_échecPassager_rendLaPièce_quiRepartiraÀLaProchaineRéception() async {
        let (sut, writer, registry) = makeSUT(outcome: .failed)
        sut.consider([message([photo()])])
        await settle()
        XCTAssertTrue(registry.claim("p1"), "la pièce a été rendue au registre")
        XCTAssertEqual(writer.savedIds, ["p1"])
    }

    func test_consider_accèsRefusé_gardeLaPièce_aucuneBoucleDeDemande() async {
        let (sut, writer, _) = makeSUT(outcome: .denied)
        sut.consider([message([photo()])])
        await settle()
        sut.consider([message([photo()])])
        await settle()
        XCTAssertEqual(writer.savedIds, ["p1"], "un refus ne se redemande pas à chaque réception")
    }

    func test_consider_réseauInterdit_attendSansRéserver() async {
        let (sut, writer, registry) = makeSUT(allowed: false)
        sut.consider([message([video()])])
        await settle()
        XCTAssertTrue(writer.savedIds.isEmpty)
        XCTAssertTrue(registry.claim("v1"), "la vidéo n'est pas réservée : elle partira quand le réseau le permettra")
    }
}

private final class StubAutoSaveSetting: ReceivedMediaAutoSaveSetting {
    let isEnabled: Bool
    init(isEnabled: Bool) { self.isEnabled = isEnabled }
}

private final class SpyAlbumWriter: ReceivedMediaAlbumWriting, @unchecked Sendable {
    private let outcome: ReceivedMediaSaveOutcome
    private let recorder = Recorder()

    init(outcome: ReceivedMediaSaveOutcome) { self.outcome = outcome }

    var savedIds: [String] { recorder.ids }

    func save(_ attachment: MessageAttachment) async -> ReceivedMediaSaveOutcome {
        recorder.append(attachment.id)
        return outcome
    }

    private final class Recorder: @unchecked Sendable {
        private let lock = NSLock()
        private var stored: [String] = []
        var ids: [String] { lock.withLock { stored } }
        func append(_ id: String) { lock.withLock { stored.append(id) } }
    }
}
