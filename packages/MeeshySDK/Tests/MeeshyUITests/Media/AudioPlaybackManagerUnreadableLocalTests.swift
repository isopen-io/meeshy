import Testing
import Foundation
@testable import MeeshyUI

/// `playLocal` sur un fichier présent mais ILLISIBLE (droits, fichier en cours d'écriture) sortait sans rien dire
/// à personne : la session audio restait tenue (ducking des autres apps) et la file — autoplay ou coordinateur —
/// restait sur ce vocal. Même sortie que les deux échecs voisins (`play(urlString:)`, `playData`).
@Suite("AudioPlaybackManager — un fichier local illisible libère la file")
struct AudioPlaybackManagerUnreadableLocalTests {

    @Test("Un fichier illisible termine la piste : la file avance et la piste courante s'efface")
    @MainActor
    func test_anUnreadableLocalFile_endsTheTrack() async throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("unreadable-\(UUID().uuidString).m4a")
        try Data(count: 64).write(to: url)
        try FileManager.default.setAttributes([.posixPermissions: 0o000], ofItemAtPath: url.path)
        defer {
            try? FileManager.default.setAttributes([.posixPermissions: 0o644], ofItemAtPath: url.path)
            try? FileManager.default.removeItem(at: url)
        }
        #expect((try? Data(contentsOf: url)) == nil, "précondition : le fichier est illisible")

        let manager = AudioPlaybackManager(registerWithCoordinator: false)
        var finishes = 0
        manager.onPlaybackFinished = { finishes += 1 }
        manager.playLocal(url: url)

        for _ in 0..<100 where finishes == 0 { try await Task.sleep(nanoseconds: 20_000_000) }

        #expect(finishes == 1)
        #expect(manager.currentUrl == nil)
        #expect(manager.isLoading == false)
    }
}
