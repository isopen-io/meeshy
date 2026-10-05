import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// **Un média adopté garde son fichier local sur le canvas du composer**
/// (#8540) : sans cela, le fond changeait d'identité à l'adoption et se
/// rechargeait par le réseau — la carte disparaissait 0,6 s.
@MainActor
final class StoryReaderContextAliasTests: XCTestCase {

    private func fichier() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("alias-\(UUID().uuidString).mp4")
        try Data([0]).write(to: url)
        return url
    }

    func test_unFondAdopte_reprendSonFichierLocal() throws {
        let local = try fichier()
        defer { try? FileManager.default.removeItem(at: local) }
        let ctx = StoryReaderContext(localMediaAliases: ["https://cdn/v.mp4": local])
        guard case .video(let cle, true, false, nil) = ctx.aliasingLocalMedia(
            .video(postMediaId: "https://cdn/v.mp4", looping: true, mute: false, thumbHash: nil)) else {
            return XCTFail("le fond vidéo doit garder sa forme")
        }
        XCTAssertEqual(cle, local.absoluteString)
    }

    func test_unFichierDisparu_rendLAdresseDistante() {
        let absent = URL(fileURLWithPath: "/tmp/absent-\(UUID().uuidString).jpg")
        let ctx = StoryReaderContext(localMediaAliases: ["https://cdn/i.jpg": absent])
        guard case .image(let cle, _) = ctx.aliasingLocalMedia(.image(postMediaId: "https://cdn/i.jpg", thumbHash: nil)) else {
            return XCTFail("image attendue")
        }
        XCTAssertEqual(cle, "https://cdn/i.jpg", "un fichier absent ne peut pas servir d'alias")
    }

    func test_sansAlias_leFondNeChangePas() {
        guard case .image(let cle, _) = StoryReaderContext.empty.aliasingLocalMedia(
            .image(postMediaId: "pm", thumbHash: nil)) else { return XCTFail("image attendue") }
        XCTAssertEqual(cle, "pm")
    }

    @MainActor
    func test_lAdoption_retientLeFichierLocal() {
        let vm = StoryComposerViewModel()
        guard let objet = vm.addMediaObject(kind: .video, toSlideId: vm.currentSlide.id) else { return XCTFail() }
        vm.setMediaURL(id: objet.id, url: "file:///tmp/v.mp4", slideId: vm.currentSlide.id)
        XCTAssertTrue(vm.adoptPreUploadedMedia(localURL: "file:///tmp/v.mp4", postMediaId: "pm-v", remoteURL: "https://cdn/v.mp4"))
        XCTAssertEqual(vm.adoptedLocalMedia["https://cdn/v.mp4"]?.path, "/tmp/v.mp4")
        XCTAssertEqual(vm.adoptedLocalMedia["pm-v"]?.path, "/tmp/v.mp4")
    }
}
