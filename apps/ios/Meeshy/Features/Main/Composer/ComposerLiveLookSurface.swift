import CoreImage
import Metal
import MetalKit
import QuartzCore
import SwiftUI

/// **Le look en direct, à l'écran** (#9329) — un `MTKView` posé au-dessus de
/// l'aperçu système. Il ne prend aucun toucher, et tant qu'aucune trame n'est
/// peinte il reste transparent : l'aperçu système se voit dessous.
struct ComposerLiveLookSurface: UIViewRepresentable {
    let look: ComposerPhotoLook
    let person: CallFramePerson
    let texts: CallFrameTexts
    let feed: ComposerCameraFeed

    func makeCoordinator() -> ComposerLiveLookRenderer {
        ComposerLiveLookRenderer(feed: feed)
    }

    func makeUIView(context: Context) -> MTKView {
        context.coordinator.makeView()
    }

    func updateUIView(_ view: MTKView, context: Context) {
        context.coordinator.update(look: look, person: person, texts: texts, view: view)
    }

    static func dismantleUIView(_ view: MTKView, coordinator: ComposerLiveLookRenderer) {
        coordinator.stop(view)
    }
}

/// Le moteur de la surface : la trame filtrée par la colorimétrie de l'appel,
/// posée dans le cadre par le compositeur du cadre en direct de l'appel — les
/// mêmes pièces, aucune jumelle.
///
/// **Ce qui le distingue de `CallLiveFrameRenderer`, et pourquoi il n'est pas
/// lui** : l'appel compose des pistes WebRTC sRGB sans gestion des couleurs ;
/// le viseur compose les trames Display P3 de l'objectif, et l'aperçu doit
/// rendre EXACTEMENT ce que la prise rendra (#9327). Son `CIContext` gère donc
/// les couleurs et peint dans un drawable étiqueté P3.
final class ComposerLiveLookRenderer: NSObject, MTKViewDelegate {
    private let feed: ComposerCameraFeed
    private let compositor: any CallLiveFrameCompositing
    private let device: MTLDevice?
    private let commandQueue: MTLCommandQueue?
    private let context: CIContext?
    private let painter = DispatchQueue(label: "me.meeshy.composer.live-look.painter", qos: .userInitiated)

    private var look = ComposerPhotoLook()
    private var design: CallFrameDesign?
    private var person: CallFramePerson?
    private var texts: CallFrameTexts?
    private var requested: CallLiveFrameLayerInputs?
    private var scene: CallLiveFrameScene?

    nonisolated deinit {}

    init(feed: ComposerCameraFeed, compositor: (any CallLiveFrameCompositing)? = nil) {
        self.feed = feed
        self.compositor = compositor ?? CallLiveFrameCompositor()
        let device = MTLCreateSystemDefaultDevice()
        self.device = device
        self.commandQueue = device?.makeCommandQueue()
        self.context = device.map {
            CIContext(mtlDevice: $0, options: [
                .cacheIntermediates: false,
                .priorityRequestLow: false,
            ])
        }
        super.init()
    }

    func makeView() -> MTKView {
        let view = MTKView(frame: .zero, device: device)
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

    func update(look: ComposerPhotoLook, person: CallFramePerson, texts: CallFrameTexts, view: MTKView) {
        self.look = look
        self.person = person
        self.texts = texts
        design = ComposerLiveLookRule.design(for: look.frame)
        if design == nil {
            scene = nil
            requested = nil
        }
        requestPaintIfNeeded(view: view)
    }

    func stop(_ view: MTKView) {
        view.isPaused = true
        view.delegate = nil
        scene = nil
        requested = nil
    }

    // MARK: - Peindre le cadre, quand une entrée change

    private func requestPaintIfNeeded(view: MTKView) {
        guard let design, let person, let texts else { return }
        let size = CallLiveFrameRule.paintSize(viewSize: ComposerLiveLookRule.sceneSize(in: view.bounds.size),
                                               scale: view.contentScaleFactor)
        guard size != .zero else { return }
        let inputs = CallLiveFrameLayerInputs(frameId: design.id, people: [person], texts: texts, size: size)
        guard CallLiveFrameRule.needsRepaint(current: requested, next: inputs) else { return }
        requested = inputs
        scene = nil
        let deliver: @MainActor (CallLiveFrameScene?) -> Void = { [weak self] painted in
            self?.install(painted, for: inputs)
        }
        Self.paint(on: painter, compositor: compositor, design: design, inputs: inputs, deliver: deliver)
    }

    nonisolated private static func paint(
        on queue: DispatchQueue,
        compositor: any CallLiveFrameCompositing,
        design: CallFrameDesign,
        inputs: CallLiveFrameLayerInputs,
        deliver: @escaping @MainActor (CallLiveFrameScene?) -> Void
    ) {
        queue.async {
            let painted = compositor.paint(design: design, inputs: inputs)
            Task { @MainActor in deliver(painted) }
        }
    }

    private func install(_ painted: CallLiveFrameScene?, for inputs: CallLiveFrameLayerInputs) {
        guard requested == inputs, let painted else { return }
        scene = painted
    }

    // MARK: - MTKViewDelegate

    func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {
        requestPaintIfNeeded(view: view)
    }

    func draw(in view: MTKView) {
        guard let context, let commandQueue,
              let frame = feed.latestImage(),
              let composed = composed(frame, drawableSize: view.drawableSize),
              let drawable = view.currentDrawable,
              let buffer = commandQueue.makeCommandBuffer() else { return }
        let bounds = CGRect(origin: .zero, size: view.drawableSize)
        let opaque = composed.composited(over: CIImage(color: .black).cropped(to: bounds))
        context.render(opaque, to: drawable.texture, commandBuffer: buffer, bounds: bounds,
                       colorSpace: ComposerLiveLookRule.colorSpace)
        buffer.present(drawable)
        buffer.commit()
    }

    /// La trame filtrée, posée dans son cadre s'il y en a un. Un cadre dont les
    /// couches ne sont pas encore peintes ne montre RIEN plutôt qu'une image
    /// sans cadre : l'aperçu système reste visible dessous une image de plus.
    private func composed(_ frame: CIImage, drawableSize: CGSize) -> CIImage? {
        let graded = ComposerLiveLookRule.graded(frame, filter: look.filter)
        guard design != nil else {
            return graded.transformed(by: CallLiveFrameGeometry.fit(scene: graded.extent.size, into: drawableSize))
        }
        guard let scene, let person else { return nil }
        return compositor.compose(scene, videos: [person.id: graded])
            .transformed(by: ComposerLiveLookRule.fit(scene: scene.size, into: drawableSize))
    }
}
