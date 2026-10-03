import CoreImage
import Metal
import MetalKit
import SwiftUI

/// **LE CADRE EN DIRECT, À L'ÉCRAN** (#9214) — un `MTKView` à 30 images/s posé au-dessus de la
/// vidéo principale du duo. Il ne prend aucun toucher (le toucher reste à la vidéo, qui masque
/// ou rend les contrôles) ; tant que la première scène n'est pas peinte, il reste transparent
/// et la vidéo habituelle se voit dessous.
struct CallLiveFrameSurface: UIViewRepresentable {
    let design: CallFrameDesign
    let people: [CallFramePerson]
    let texts: CallFrameTexts
    let sources: [String: CallLiveFrameVideoSource]

    func makeCoordinator() -> CallLiveFrameRenderer {
        CallLiveFrameRenderer()
    }

    func makeUIView(context: Context) -> MTKView {
        context.coordinator.makeView()
    }

    func updateUIView(_ view: MTKView, context: Context) {
        context.coordinator.update(design: design, people: people, texts: texts, sources: sources, view: view)
    }

    static func dismantleUIView(_ view: MTKView, coordinator: CallLiveFrameRenderer) {
        coordinator.stop(view)
    }
}

/// Le moteur de la surface : il peint les couches HORS du fil principal quand une entrée
/// change (`CallLiveFrameRule.needsRepaint`), et compose chaque image sur la carte graphique
/// en un passage, rendu dans le drawable par un `CIContext` Metal.
final class CallLiveFrameRenderer: NSObject, MTKViewDelegate {
    private let compositor: any CallLiveFrameCompositing
    private let feed: any CallLiveFrameVideoFeeding
    private let meter = CallLiveFrameBudgetMeter()
    private let device: MTLDevice?
    private let commandQueue: MTLCommandQueue?
    private let context: CIContext?
    private let painter = DispatchQueue(label: "me.meeshy.call.live-frame.painter", qos: .userInitiated)
    private let colorSpace = CGColorSpaceCreateDeviceRGB()

    private var design: CallFrameDesign?
    private var people: [CallFramePerson] = []
    private var texts: CallFrameTexts?
    private var requested: CallLiveFrameLayerInputs?
    private var scene: CallLiveFrameScene?

    nonisolated deinit {}

    init(compositor: (any CallLiveFrameCompositing)? = nil, feed: (any CallLiveFrameVideoFeeding)? = nil) {
        self.compositor = compositor ?? CallLiveFrameCompositor()
        self.feed = feed ?? CallLiveFrameVideoFeed()
        let device = MTLCreateSystemDefaultDevice()
        self.device = device
        self.commandQueue = device?.makeCommandQueue()
        self.context = device.map {
            CIContext(mtlDevice: $0, options: [
                .useSoftwareRenderer: false,
                .cacheIntermediates: false,
                .priorityRequestLow: false,
                .workingColorSpace: NSNull(),
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
        return view
    }

    func update(design: CallFrameDesign, people: [CallFramePerson], texts: CallFrameTexts, sources: [String: CallLiveFrameVideoSource], view: MTKView) {
        if self.design?.id != design.id { meter.reset(limitMs: CallLiveFrameBudget.limitMs(for: design.cost)) }
        self.design = design
        self.people = people
        self.texts = texts
        feed.attach(sources)
        requestPaintIfNeeded(view: view)
    }

    func stop(_ view: MTKView) {
        view.isPaused = true
        view.delegate = nil
        feed.detachAll()
        scene = nil
        requested = nil
    }

    // MARK: - Peindre, quand une entrée change

    private func requestPaintIfNeeded(view: MTKView) {
        guard let design, let texts else { return }
        let size = CallLiveFrameRule.paintSize(viewSize: view.bounds.size, scale: view.contentScaleFactor)
        guard size != .zero else { return }
        let inputs = CallLiveFrameLayerInputs(frameId: design.id, people: people, texts: texts, size: size)
        guard CallLiveFrameRule.needsRepaint(current: requested, next: inputs) else { return }
        requested = inputs
        let deliver: @MainActor (CallLiveFrameScene?) -> Void = { [weak self] painted in
            self?.install(painted, for: inputs)
        }
        Self.paint(on: painter, compositor: compositor, design: design, inputs: inputs, deliver: deliver)
    }

    /// Formée hors de tout acteur : la fermeture qui peint sur la file du peintre n'hérite pas
    /// de l'isolement du fil principal, et ne revient sur lui que pour livrer la scène.
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

    /// Le rappel de fin d'un tampon de commandes tourne sur un fil de Metal : formé ici,
    /// hors de tout acteur, il ne porte aucune vérification d'isolement du fil principal.
    nonisolated private static func completion(_ meter: CallLiveFrameBudgetMeter) -> MTLCommandBufferHandler {
        { completed in
            meter.record(gpuMs: (completed.gpuEndTime - completed.gpuStartTime) * 1000)
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
        guard let scene, let context, let commandQueue,
              let drawable = view.currentDrawable,
              let buffer = commandQueue.makeCommandBuffer() else { return }
        let drawableSize = view.drawableSize
        let composed = compositor.compose(scene, videos: feed.latestImages())
            .transformed(by: CallLiveFrameGeometry.fit(scene: scene.size, into: drawableSize))
        context.render(composed, to: drawable.texture, commandBuffer: buffer, bounds: CGRect(origin: .zero, size: drawableSize), colorSpace: colorSpace)
        buffer.addCompletedHandler(Self.completion(meter))
        buffer.present(drawable)
        buffer.commit()
    }
}
