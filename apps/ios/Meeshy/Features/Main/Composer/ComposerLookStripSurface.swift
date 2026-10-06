import CoreImage
import Metal
import MetalKit
import QuartzCore
import SwiftUI

/// Une case peinte : sa position dans le CONTENU de la surface (points, y vers
/// le bas), et le look qu'elle montre (#9351).
nonisolated struct ComposerLookStripTile: Equatable, Sendable {
    let index: Int
    let look: ComposerPhotoLook
    let rect: CGRect
}

/// **La géométrie de la bande peinte** (#9351, spec § 5).
nonisolated enum ComposerLookStripGeometry {
    /// La plus grande texture 2D garantie sur les puces d'iOS 16 (A11 et suivantes).
    static let maxTexturePixels: CGFloat = 16_384
    /// Les places de l'atlas : de quoi tenir toute la fenêtre peinte d'un iPhone.
    static let minimumSlots = 16

    /// Le rectangle d'une case (points, y vers le bas) en pixels Core Image (y vers le haut).
    static func pixelRect(_ tile: CGRect, contentHeight: CGFloat, scale: CGFloat) -> CGRect {
        CGRect(x: tile.minX * scale, y: (contentHeight - tile.maxY) * scale,
               width: tile.width * scale, height: tile.height * scale)
    }

    /// La fenêtre des cases peintes : la vue Metal ne couvre qu'elle.
    static func paintedWindow(_ indices: [Int]) -> ClosedRange<Int>? {
        guard let premiere = indices.min(), let derniere = indices.max() else { return nil }
        return premiere...derniere
    }

    /// Assez de places pour que deux cases de la fenêtre n'en partagent jamais une.
    static func slotCount(for indices: [Int]) -> Int {
        max(minimumSlots, paintedWindow(indices)?.count ?? 0)
    }

    /// La place d'une case dans l'atlas : elle la garde tant que la fenêtre glisse.
    static func slot(of index: Int, slots: Int) -> Int {
        ((index % slots) + slots) % slots
    }
}

/// **La bande, peinte dans UN atlas Metal** (#9351, spec § 5) : la vue couvre la
/// seule FENÊTRE des cases peintes (visibles ±1, au plus le budget thermique) et
/// défile avec le contenu. Chaque case se peint dans SA place d'un atlas
/// persistant, recopiée dans le drawable en un seul passage de copie : une case
/// qui ne reçoit pas de trame (palier « serious », défilement en cours) garde sa
/// dernière image, et seule une case neuve se peint.
struct ComposerLookStripSurface: UIViewRepresentable {
    let tiles: [ComposerLookStripTile]
    let source: any ComposerFrameSourcing
    let person: CallFramePerson
    let date: Date
    let framing: ComposerFraming
    /// 0 ⇒ les cases sont figées sur leur dernière image.
    let fps: Int
    /// Le défilement fige les cases : seules les neuves se peignent.
    let frozen: Bool
    var scenes: any ComposerLookSceneProviding = ComposerLookSceneCache.shared

    func makeCoordinator() -> ComposerLookStripRenderer {
        ComposerLookStripRenderer(scenes: scenes)
    }

    func makeUIView(context: Context) -> MTKView {
        context.coordinator.makeView()
    }

    func updateUIView(_ view: MTKView, context: Context) {
        context.coordinator.update(tiles: tiles, source: source, person: person, date: date, framing: framing,
                                   fps: frozen ? 0 : fps, view: view)
    }

    static func dismantleUIView(_ view: MTKView, coordinator: ComposerLookStripRenderer) {
        coordinator.stop(view)
    }
}

/// Le moteur de la bande : la trame réduite UNE fois, chaque case peinte par le
/// peintre unique dans sa place de l'atlas, l'atlas recopié dans le drawable.
final class ComposerLookStripRenderer: NSObject, MTKViewDelegate {
    private let scenes: ComposerLookStripScenes
    /// La cadence du palier, jugée sur la file de l'objectif.
    private let gate = ComposerLookStripFrameGate(fps: 0)
    private var source: (any ComposerFrameSourcing)?
    private var tiles: [ComposerLookStripTile] = []
    private var person = ComposerPhotoLookPerson.author(id: nil, displayName: nil, username: nil)
    private var date = Date(timeIntervalSince1970: 0)
    private var framing = ComposerFraming.identity
    /// Une trame admise attend d'être peinte dans toutes les cases.
    private var frameDue = false
    private var atlas: MTLTexture?
    private var slotCount = ComposerLookStripGeometry.minimumSlots
    private var slots: [Int: ComposerLookStripSlot] = [:]
    /// La trame réduite, texture privée réécrite dans le passage de chaque dessin :
    /// l'ordre des passages de la file garantit qu'aucune lecture n'en voit la suivante.
    private var reducedTexture: MTLTexture?
    private weak var view: MTKView?

    nonisolated deinit {}

    init(scenes: any ComposerLookSceneProviding) {
        self.scenes = ComposerLookStripScenes(provider: scenes)
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
        return view
    }

    func update(tiles: [ComposerLookStripTile], source: any ComposerFrameSourcing, person: CallFramePerson,
                date: Date, framing: ComposerFraming, fps: Int, view: MTKView) {
        gate.setFPS(fps)
        view.contentScaleFactor = max(1, view.traitCollection.displayScale)
        let autreSource = self.source !== source
        let perime = autreSource || framing != self.framing || date != self.date || person != self.person
        if autreSource {
            self.source?.setFrameHandler(nil, for: ObjectIdentifier(self))
            self.source = source
            let gate = self.gate
            source.setFrameHandler({ [weak self] presentedAt in
                let admission = gate.admit(presentedAt: presentedAt)
                guard admission != .refused else { return }
                Task { @MainActor [weak self] in self?.frameArrived(live: admission == .paced) }
            }, for: ObjectIdentifier(self))
        }
        if perime {
            slots = [:]
            scenes.reset()
        }
        let changed = perime || tiles != self.tiles
        self.tiles = tiles
        self.person = person
        self.date = date
        self.framing = framing
        if changed { view.setNeedsDisplay() }
    }

    func stop(_ view: MTKView) {
        source?.setFrameHandler(nil, for: ObjectIdentifier(self))
        source = nil
        view.delegate = nil
        atlas = nil
        slots = [:]
        reducedTexture = nil
    }

    private func frameArrived(live: Bool) {
        guard !tiles.isEmpty else { return }
        frameDue = frameDue || live
        view?.setNeedsDisplay()
    }

    func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}

    func draw(in view: MTKView) {
        let vivante = frameDue
        frameDue = false
        guard let queue = ComposerLookGPU.commandQueue, let drawable = view.currentDrawable,
              let buffer = queue.makeCommandBuffer() else { return }
        let echelle = view.contentScaleFactor
        if let cellule = tiles.first?.rect.size, let atlas = atlas(cell: cellule, scale: echelle) {
            paint(ComposerLookStripPaintRule.tilesToPaint(tiles, painted: slots, slots: slotCount, live: vivante,
                                                          scenesReady: scenesReady()),
                  into: atlas, cell: cellule, scale: echelle, buffer: buffer)
            present(atlas, into: drawable.texture, scale: echelle, buffer: buffer)
            if ComposerLookStripPaintRule.needsFrame(tiles, painted: slots, slots: slotCount) { gate.requestFrame() }
        } else {
            clear(drawable.texture, buffer: buffer)
        }
        buffer.present(drawable)
        buffer.commit()
    }

    /// Les cases peintes sans leur cadre dont la scène vient de cuire.
    private func scenesReady() -> Set<Int> {
        let toile = ComposerLookPainter.thumbnailCanvas
        return Set(tiles.filter { tile in
            guard tile.look.frame != ComposerPhotoFrame.none,
                  slots[slot(of: tile)].map({ $0.index == tile.index && !$0.complete }) ?? false else { return false }
            return scenes.isReady(ComposerLookSceneKey(look: tile.look, canvas: toile, date: date, person: person))
        }.map(\.index))
    }

    private func slot(of tile: ComposerLookStripTile) -> Int {
        ComposerLookStripGeometry.slot(of: tile.index, slots: slotCount)
    }

    /// Chaque case dans SA place de l'atlas, depuis la trame réduite une fois. Une
    /// case dont le cadre cuit encore se peint avec son seul filtre, et le retient :
    /// elle se repeint dès que la scène est prête.
    private func paint(_ tiles: [ComposerLookStripTile], into atlas: MTLTexture, cell: CGSize, scale: CGFloat,
                       buffer: MTLCommandBuffer) {
        guard !tiles.isEmpty, let source, let frame = source.latestImage(), let petit = reduced(frame, buffer: buffer) else { return }
        let destination = CIRenderDestination(mtlTexture: atlas, commandBuffer: buffer)
        destination.isFlipped = true
        destination.colorSpace = ComposerLiveLookRule.colorSpace
        let toile = ComposerLookPainter.thumbnailCanvas
        tiles.forEach { tile in
            let cle = ComposerLookSceneKey(look: tile.look, canvas: toile, date: date, person: person)
            let scene = tile.look.frame == ComposerPhotoFrame.none
                ? nil : scenes.scene(for: cle) { [weak self] in self?.view?.setNeedsDisplay() }
            let look = tile.look.frame != ComposerPhotoFrame.none && scene == nil
                ? ComposerPhotoLook(filter: tile.look.filter) : tile.look
            let peinte = ComposerLookPainter.paint(petit, look: look, framing: framing, scene: scene, canvas: toile,
                                                   declared: source.declaredSpace)
            let place = slot(of: tile)
            let cible = ComposerLookStripGeometry.pixelRect(
                CGRect(x: CGFloat(place) * cell.width, y: 0, width: cell.width, height: cell.height),
                contentHeight: cell.height, scale: scale).integral
            let posee = peinte.transformed(by: CGAffineTransform(scaleX: cible.width / toile.width,
                                                                 y: cible.height / toile.height)
                .concatenating(CGAffineTransform(translationX: cible.minX, y: cible.minY)))
            guard (try? ComposerLookGPU.context.startTask(toRender: posee, from: cible, to: destination,
                                                          at: cible.origin)) != nil else { return }
            slots[place] = ComposerLookStripSlot(index: tile.index, look: tile.look, complete: look == tile.look)
        }
    }

    /// Le drawable vidé, puis chaque case peinte recopiée de sa place à son rang.
    private func present(_ atlas: MTLTexture, into target: MTLTexture, scale: CGFloat, buffer: MTLCommandBuffer) {
        clear(target, buffer: buffer)
        guard let copie = buffer.makeBlitCommandEncoder() else { return }
        let largeur = atlas.width / slotCount
        tiles.forEach { tile in
            let place = slot(of: tile)
            guard slots[place]?.index == tile.index else { return }
            let x = Int((tile.rect.minX * scale).rounded())
            let y = Int((tile.rect.minY * scale).rounded())
            let w = min(largeur, target.width - x)
            let h = min(atlas.height, target.height - y)
            guard x >= 0, y >= 0, w > 0, h > 0 else { return }
            copie.copy(from: atlas, sourceSlice: 0, sourceLevel: 0,
                       sourceOrigin: MTLOrigin(x: place * largeur, y: 0, z: 0),
                       sourceSize: MTLSize(width: w, height: h, depth: 1),
                       to: target, destinationSlice: 0, destinationLevel: 0,
                       destinationOrigin: MTLOrigin(x: x, y: y, z: 0))
        }
        copie.endEncoding()
    }

    private func clear(_ texture: MTLTexture, buffer: MTLCommandBuffer) {
        let passe = MTLRenderPassDescriptor()
        passe.colorAttachments[0].texture = texture
        passe.colorAttachments[0].loadAction = .clear
        passe.colorAttachments[0].clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 0)
        passe.colorAttachments[0].storeAction = .store
        buffer.makeRenderCommandEncoder(descriptor: passe)?.endEncoding()
    }

    /// L'atlas persistant : une rangée de places à la taille d'une case. Il ne se
    /// refait que si l'échelle, la case ou le nombre de places change — et ses
    /// places se vident alors.
    private func atlas(cell: CGSize, scale: CGFloat) -> MTLTexture? {
        let places = ComposerLookStripGeometry.slotCount(for: tiles.map(\.index))
        let largeur = Int((cell.width * scale).rounded())
        let hauteur = Int((cell.height * scale).rounded())
        if let atlas, places == slotCount, atlas.width == largeur * places, atlas.height == hauteur { return atlas }
        guard largeur >= 1, hauteur >= 1, let device = ComposerLookGPU.device else { return nil }
        let description = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .bgra8Unorm, width: largeur * places,
                                                                   height: hauteur, mipmapped: false)
        description.usage = [.shaderRead, .shaderWrite, .renderTarget]
        description.storageMode = .private
        guard let neuf = device.makeTexture(descriptor: description) else { return nil }
        slotCount = places
        slots = [:]
        atlas = neuf
        return neuf
    }

    /// **La source réduite UNE fois** pour toutes les cases (spec § 5), dans le
    /// passage du dessin : ni second rendu, ni attente sur le fil principal. Le
    /// grand côté garde 2 × 288 px — deux fois la toile d'une case, de quoi
    /// recadrer sans flou.
    private func reduced(_ frame: CIImage, buffer: MTLCommandBuffer) -> CIImage? {
        let plusGrand = max(frame.extent.width, frame.extent.height)
        guard plusGrand > 0, !frame.extent.isInfinite else { return nil }
        let echelle = min(1, 2 * ComposerLookPainter.thumbnailCanvas.height / plusGrand)
        let petit = frame.transformed(by: CGAffineTransform(translationX: -frame.extent.minX, y: -frame.extent.minY)
            .concatenating(CGAffineTransform(scaleX: echelle, y: echelle)))
        let largeur = Int(petit.extent.width.rounded()), hauteur = Int(petit.extent.height.rounded())
        guard largeur > 0, hauteur > 0, let texture = reductionTarget(width: largeur, height: hauteur) else { return nil }
        let destination = CIRenderDestination(mtlTexture: texture, commandBuffer: buffer)
        destination.colorSpace = ComposerLiveLookRule.colorSpace
        guard (try? ComposerLookGPU.context.startTask(toRender: petit, to: destination)) != nil else { return nil }
        return CIImage(mtlTexture: texture, options: [.colorSpace: ComposerLiveLookRule.colorSpace])
    }

    private func reductionTarget(width: Int, height: Int) -> MTLTexture? {
        if let reducedTexture, reducedTexture.width == width, reducedTexture.height == height { return reducedTexture }
        guard let device = ComposerLookGPU.device else { return nil }
        let description = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .bgra8Unorm, width: width,
                                                                   height: height, mipmapped: false)
        description.usage = [.shaderRead, .shaderWrite, .renderTarget]
        description.storageMode = .private
        reducedTexture = device.makeTexture(descriptor: description)
        return reducedTexture
    }
}
