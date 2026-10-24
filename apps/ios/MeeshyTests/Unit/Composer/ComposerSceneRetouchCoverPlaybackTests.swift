import XCTest
import SwiftUI
import AVFoundation
import MeeshySDK
@testable import MeeshyUI
@testable import Meeshy

/// #12605 — **la scène du studio se tait sous la retouche de la caméra.** Un `fullScreenCover`
/// ne prévient pas l'écran recouvert (#9052) : la mesure monte la scène sonore et la
/// couverture de retouche dans une vraie fenêtre, et écoute le mixer de la scène.
@MainActor
final class ComposerSceneRetouchCoverPlaybackTests: XCTestCase {

    private final class Demande: ObservableObject {
        @Published var retouche: ComposerSceneMediaRetouchRequest?
    }

    private struct Banc: View {
        @State var slide: StorySlide
        @ObservedObject var demande: Demande
        let sons: [String: URL]

        var body: some View {
            StoryComposerCanvasView(slide: $slide, loadedAudioURLs: sons)
                .modifier(ComposerSceneMediaRetouchCover(request: $demande.retouche) { _, _ in })
        }
    }

    private var fenetre: UIWindow?

    override func tearDown() async throws {
        fenetre?.rootViewController?.dismiss(animated: false)
        fenetre?.isHidden = true
        fenetre = nil
        try await super.tearDown()
    }

    func test_theRetouchCover_silencesTheScene_andTheSceneResumesWhenItCloses() async throws {
        let demande = Demande()
        let scene = try await monter(demande)
        try await attendre("la scène joue son son avant la retouche") { scene.audioMixer.isPlaying }

        demande.retouche = ComposerSceneMediaRetouchRequest(objectId: "photo", source: .image(Self.photo()))
        try await attendre("la retouche est présentée") { self.fenetre?.rootViewController?.presentedViewController != nil }
        try await Task.sleep(for: .seconds(1))
        XCTAssertNotNil(scene.window, "mesure : la scène reste dans sa fenêtre sous la couverture")
        XCTAssertFalse(scene.audioMixer.isPlaying, "sous la retouche, la scène ne joue plus")

        demande.retouche = nil
        try await attendre("la scène reprend à la fermeture") { scene.audioMixer.isPlaying }
    }

    // MARK: - Banc

    private func monter(_ demande: Demande) async throws -> StoryCanvasUIView {
        let fixture = try Self.son(seconds: 3)
        let son = StoryAudioPlayerObject(id: "son", postMediaId: "son", volume: 1, startTime: 0, duration: 3, loop: true)
        let slide = StorySlide(effects: StoryEffects(background: "1E1B4B", audioPlayerObjects: [son]))
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let fenetre = UIWindow(windowScene: scene)
        fenetre.frame = scene.coordinateSpace.bounds
        fenetre.rootViewController = UIHostingController(rootView: Banc(slide: slide, demande: demande, sons: ["son": fixture]))
        fenetre.makeKeyAndVisible()
        self.fenetre = fenetre
        try await attendre("le canvas de la scène est monté") { Self.canvas(in: fenetre) != nil }
        return try XCTUnwrap(Self.canvas(in: fenetre))
    }

    private func attendre(_ quoi: String, secondes: Double = 8, _ condition: @escaping @MainActor () -> Bool) async throws {
        let fin = Date().addingTimeInterval(secondes)
        while !condition() {
            guard Date() < fin else { return XCTFail("délai dépassé : \(quoi)") }
            try await Task.sleep(for: .milliseconds(50))
        }
    }

    private static func canvas(in vue: UIView) -> StoryCanvasUIView? {
        if let canvas = vue as? StoryCanvasUIView { return canvas }
        return vue.subviews.lazy.compactMap { canvas(in: $0) }.first
    }

    private static func photo() -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 90, height: 160)).image { contexte in
            UIColor.orange.setFill()
            contexte.fill(CGRect(x: 0, y: 0, width: 90, height: 160))
        }
    }

    private static func son(seconds: Double) throws -> URL {
        let frequence: Double = 8_000
        guard let format = AVAudioFormat(standardFormatWithSampleRate: frequence, channels: 1),
              let tampon = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frequence))
        else { throw XCTSkip("AVAudioFormat indisponible") }
        tampon.frameLength = AVAudioFrameCount(frequence)
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("scene-retouche-\(UUID().uuidString).caf")
        let fichier = try AVAudioFile(forWriting: url, settings: format.settings)
        try (0..<Int(seconds)).forEach { _ in try fichier.write(from: tampon) }
        return url
    }
}
