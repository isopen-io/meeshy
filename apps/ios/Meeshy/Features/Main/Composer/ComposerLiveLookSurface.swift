import CoreImage
import Metal
import MetalKit
import QuartzCore
import SwiftUI

/// **Le look en direct, à l'écran** (#9329, #9347) — un `MTKView` qui peint le
/// canevas 9:16 par le peintre unique. Il ne prend aucun toucher, et tant
/// qu'aucune trame n'est peinte il reste transparent : l'aperçu système se voit
/// dessous.
struct ComposerLiveLookSurface: UIViewRepresentable {
    let look: ComposerPhotoLook
    let person: CallFramePerson
    let date: Date
    let framing: ComposerFraming
    let source: ComposerCameraFeed
    var scenes: any ComposerLookSceneProviding = ComposerLookSceneCache.shared

    func makeCoordinator() -> ComposerLiveLookRenderer {
        ComposerLiveLookRenderer(source: source, scenes: scenes)
    }

    func makeUIView(context: Context) -> MTKView {
        context.coordinator.makeView()
    }

    func updateUIView(_ view: MTKView, context: Context) {
        context.coordinator.update(look: look, person: person, date: date, framing: framing)
    }

    static func dismantleUIView(_ view: MTKView, coordinator: ComposerLiveLookRenderer) {
        coordinator.stop(view)
    }
}

/// Le moteur de la surface : la trame, le look, la scène cuite — rien d'autre.
final class ComposerLiveLookRenderer: NSObject, MTKViewDelegate {
    private let source: ComposerCameraFeed
    private let scenes: any ComposerLookSceneProviding

    private var look = ComposerPhotoLook()
    private var framing = ComposerFraming.identity
    private var key: ComposerLookSceneKey?
    /// La scène du look courant, posée au changement de look ou à la fin de sa
    /// cuisson — jamais relue dans le cache à chaque image.
    private var scene: CallLiveFrameScene?

    nonisolated deinit {}

    init(source: ComposerCameraFeed, scenes: any ComposerLookSceneProviding) {
        self.source = source
        self.scenes = scenes
        super.init()
    }

    func makeView() -> MTKView {
        let view = MTKView(frame: .zero, device: ComposerLookGPU.device)
        view.delegate = self
        view.framebufferOnly = false
        view.colorPixelFormat = .bgra8Unorm
        view.preferredFramesPerSecond = 30
        view.enableSetNeedsDisplay = false
        view.isPaused = false
        view.autoResizeDrawable = true
        view.isOpaque = false
        view.backgroundColor = .clear
        view.clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 0)
        view.isUserInteractionEnabled = false
        (view.layer as? CAMetalLayer)?.colorspace = ComposerLiveLookRule.colorSpace
        return view
    }

    func update(look: ComposerPhotoLook, person: CallFramePerson, date: Date, framing: ComposerFraming) {
        self.look = look
        self.framing = framing
        let cle = ComposerLookSceneKey(look: look, canvas: ComposerLookPainter.designCanvas, date: date, person: person)
        guard cle != key else { return }
        key = cle
        scene = scenes.cached(cle)
        guard look.frame != ComposerPhotoFrame.none, scene == nil else { return }
        scenes.prepare(cle) { [weak self] in
            guard let self, self.key == cle else { return }
            self.scene = self.scenes.cached(cle)
        }
    }

    func stop(_ view: MTKView) {
        view.isPaused = true
        view.delegate = nil
        key = nil
        scene = nil
    }

    func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}

    func draw(in view: MTKView) {
        guard let commandQueue = ComposerLookGPU.commandQueue,
              let frame = source.latestImage(),
              let drawable = view.currentDrawable,
              let buffer = commandQueue.makeCommandBuffer() else { return }
        let lookPeint = look.frame != ComposerPhotoFrame.none && scene == nil ? ComposerPhotoLook(filter: look.filter) : look
        let peinte = ComposerLookPainter.paint(frame, look: lookPeint, framing: framing, scene: scene,
                                               canvas: ComposerLookPainter.designCanvas, declared: source.declaredSpace)
        let bounds = CGRect(origin: .zero, size: view.drawableSize)
        let ecran = ComposerLookPainter.onScreen(peinte, canvas: ComposerLookPainter.designCanvas, drawable: view.drawableSize)
        let opaque = ecran.composited(over: CIImage(color: .black).cropped(to: bounds))
        ComposerLookGPU.context.render(opaque, to: drawable.texture, commandBuffer: buffer, bounds: bounds,
                                       colorSpace: ComposerLiveLookRule.colorSpace)
        buffer.present(drawable)
        buffer.commit()
    }
}
