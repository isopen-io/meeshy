import CoreImage
import Metal
import MetalKit
import QuartzCore
import SwiftUI

/// **Le look en direct, à l'écran** (#9329, #9347) — un `MTKView` qui peint le
/// canevas du viseur par le peintre unique. Il ne prend aucun toucher, et tant
/// qu'aucune trame n'est peinte il reste transparent. Sa première image
/// présentée est ANNONCÉE (`onFirstFrame`) : l'hôte garde l'aperçu système
/// visible jusque-là, puis le détache (#9349).
struct ComposerLiveLookSurface: UIViewRepresentable {
    let look: ComposerPhotoLook
    let person: CallFramePerson
    let date: Date
    let framing: ComposerFraming
    let source: any ComposerFrameSourcing
    /// La toile peinte : aux proportions du viseur (#9557).
    let canvas: CGSize
    var fps: Int = 30
    var surfaceScale: CGFloat = 1
    var scenes: any ComposerLookSceneProviding = ComposerLookSceneCache.shared
    var onFirstFrame: (() -> Void)?

    func makeCoordinator() -> ComposerLiveLookRenderer {
        ComposerLiveLookRenderer(source: source, scenes: scenes)
    }

    func makeUIView(context: Context) -> MTKView {
        context.coordinator.makeView()
    }

    func updateUIView(_ view: MTKView, context: Context) {
        context.coordinator.onFirstFrame = onFirstFrame
        context.coordinator.update(look: look, person: person, date: date, framing: framing, canvas: canvas,
                                   fps: fps, surfaceScale: surfaceScale, view: view)
    }

    static func dismantleUIView(_ view: MTKView, coordinator: ComposerLiveLookRenderer) {
        coordinator.stop(view)
    }
}

/// Le moteur de la surface : la trame, le look, la scène cuite — rien d'autre.
final class ComposerLiveLookRenderer: NSObject, MTKViewDelegate {
    private let source: any ComposerFrameSourcing
    private let scenes: any ComposerLookSceneProviding

    private var look = ComposerPhotoLook()
    private var framing = ComposerFraming.identity
    private var canvas = CGSize.zero
    private var key: ComposerLookSceneKey?
    /// La scène du look courant, posée au changement de look ou à la fin de sa
    /// cuisson — jamais relue dans le cache à chaque image.
    private var scene: CallLiveFrameScene?
    /// La cadence permise par le palier thermique, jugée sur la file de
    /// l'objectif avec l'instant de présentation de chaque trame.
    private let gate = ComposerFrameGate(fps: 30)
    private weak var view: MTKView?
    /// Prévenu une fois, à la première image présentée.
    var onFirstFrame: (() -> Void)?
    private var hasPresented = false

    nonisolated deinit {}

    init(source: any ComposerFrameSourcing, scenes: any ComposerLookSceneProviding) {
        self.source = source
        self.scenes = scenes
        super.init()
    }

    func makeView() -> MTKView {
        let view = MTKView(frame: .zero, device: ComposerLookGPU.device)
        view.delegate = self
        view.framebufferOnly = false
        view.colorPixelFormat = .bgra8Unorm
        view.enableSetNeedsDisplay = true
        view.isPaused = true
        view.autoResizeDrawable = true
        view.isOpaque = false
        view.backgroundColor = .clear
        view.clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 0)
        view.isUserInteractionEnabled = false
        (view.layer as? CAMetalLayer)?.colorspace = ComposerLiveLookRule.colorSpace
        self.view = view
        let gate = self.gate
        source.setFrameHandler({ [weak self] presentedAt in
            guard gate.admit(presentedAt: presentedAt) else { return }
            Task { @MainActor [weak self] in self?.view?.setNeedsDisplay() }
        }, for: ObjectIdentifier(self))
        return view
    }

    func update(look: ComposerPhotoLook, person: CallFramePerson, date: Date, framing: ComposerFraming,
                canvas: CGSize, fps: Int, surfaceScale: CGFloat, view: MTKView) {
        let changed = look != self.look || framing != self.framing || canvas != self.canvas
        self.look = look
        self.framing = framing
        self.canvas = canvas
        gate.setFPS(fps)
        view.contentScaleFactor = max(1, view.traitCollection.displayScale * surfaceScale)
        let cle = ComposerLookSceneKey(look: look, canvas: canvas, date: date, person: person)
        if cle != key {
            key = cle
            scene = scenes.cached(cle)
            if look.frame != ComposerPhotoFrame.none, scene == nil {
                scenes.prepare(cle) { [weak self] in
                    guard let self, self.key == cle else { return }
                    self.scene = self.scenes.cached(cle)
                    self.view?.setNeedsDisplay()
                }
            }
        }
        if changed { view.setNeedsDisplay() }
    }

    func stop(_ view: MTKView) {
        source.setFrameHandler(nil, for: ObjectIdentifier(self))
        view.isPaused = true
        view.delegate = nil
        key = nil
        scene = nil
    }

    /// Une source figée (#9352) ne prévient qu'une fois, parfois avant que la vue
    /// ait sa taille : la toile qui change de taille se redessine, sans attendre
    /// une trame qui ne viendra pas.
    func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {
        view.setNeedsDisplay()
    }

    func draw(in view: MTKView) {
        guard let commandQueue = ComposerLookGPU.commandQueue,
              let frame = source.latestImage(),
              let drawable = view.currentDrawable,
              let buffer = commandQueue.makeCommandBuffer() else { return }
        let lookPeint = look.frame != ComposerPhotoFrame.none && scene == nil ? ComposerPhotoLook(filter: look.filter) : look
        let peinte = ComposerLookPainter.paint(frame, look: lookPeint, framing: framing, scene: scene,
                                               canvas: canvas, declared: source.declaredSpace)
        let bounds = CGRect(origin: .zero, size: view.drawableSize)
        let ecran = ComposerLookPainter.onScreen(peinte, canvas: canvas, drawable: view.drawableSize)
        let opaque = ecran.composited(over: CIImage(color: .black).cropped(to: bounds))
        ComposerLookGPU.context.render(opaque, to: drawable.texture, commandBuffer: buffer, bounds: bounds,
                                       colorSpace: ComposerLiveLookRule.colorSpace)
        buffer.present(drawable)
        buffer.commit()
        guard !hasPresented else { return }
        hasPresented = true
        onFirstFrame?()
    }
}
