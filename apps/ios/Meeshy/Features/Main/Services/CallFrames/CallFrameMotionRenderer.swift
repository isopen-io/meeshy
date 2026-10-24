import CoreGraphics
import Foundation

/// Un ornement animé, peint une fois : une image par groupe (transparente, à la taille de la toile).
nonisolated struct CallFrameMotionSprite {
    let track: CallFrameMotionTrack
    let images: [CGImage]
}

/// #12683 — ce qui bouge dans un cadre : ses ornements animés, et le masque qui les garde hors des
/// visages et des textes (blanc là où un ornement peut se voir).
nonisolated final class CallFrameMotionScene {
    let size: CGSize
    let unit: CGFloat
    let mask: CGImage
    let sprites: [CallFrameMotionSprite]

    init(size: CGSize, unit: CGFloat, mask: CGImage, sprites: [CallFrameMotionSprite]) {
        self.size = size
        self.unit = unit
        self.mask = mask
        self.sprites = sprites
    }
}

/// **LES ORNEMENTS ANIMÉS** (#12683) — peints UNE fois par le processeur, au même endroit que dans
/// les couches fixes (même graine, même rang), puis confiés à Core Animation : aucun calcul par
/// image côté app. Les couches fixes de la même scène les omettent (`CallFrameStage.excludesMotion`).
nonisolated enum CallFrameMotionRenderer {
    typealias Painter = CallFrameRenderer

    /// Les ornements animés se peignent à la moitié de la toile, que Core Animation agrandit : une
    /// étincelle ou un confetti n'ont pas besoin de chaque pixel, et la mémoire reste dans le budget du direct.
    static let spriteScale: CGFloat = 0.5

    static func spriteSize(for size: CGSize) -> CGSize {
        CGSize(width: (size.width * spriteScale).rounded(), height: (size.height * spriteScale).rounded())
    }

    static func renderMotion(_ stage: CallFrameStage) -> CallFrameMotionScene? {
        let tracks = CallFrameMotionPlan.tracks(for: stage.look)
        guard !tracks.isEmpty else { return nil }
        let fonts = CallFrameFontBook()
        let layout = Painter.textLayout(stage, fonts: fonts)
        let sprites = tracks.compactMap { track in motionSprite(track, stage: stage, layout: layout, fonts: fonts) }
        guard sprites.count == tracks.count, let mask = motionMask(stage, layout: layout) else { return nil }
        return CallFrameMotionScene(size: stage.size, unit: stage.unit, mask: mask, sprites: sprites)
    }

    static func motionSprite(_ track: CallFrameMotionTrack, stage: CallFrameStage, layout: CallFrameTextLayout, fonts: CallFrameFontBook) -> CallFrameMotionSprite? {
        let scene = motionStage(stage, track: track, layout: layout)
        let images = (0 ..< track.partitions).compactMap { index -> CGImage? in
            guard let context = CallMontageRenderer.makeContext(size: stage.size) else { return nil }
            context.clear(stage.bounds)
            let partition = CallFrameOrnamentPartition(index: index, count: track.partitions)
            Painter.paintOrnament(context, ornament: track.ornament, scene: scene, rank: track.rank, fonts: fonts, partition: partition)
            return context.makeImage()
        }
        guard images.count == track.partitions else { return nil }
        return CallFrameMotionSprite(track: track, images: images)
    }

    /// La scène d'un ornement animé : celle des couches fixes, sauf pour ce qui tombe ou monte,
    /// semé sur toute la toile pour qu'en défilant il ne laisse jamais de bande vide.
    static func motionStage(_ stage: CallFrameStage, track: CallFrameMotionTrack, layout: CallFrameTextLayout) -> CallFrameOrnamentStage {
        let base = Painter.ornamentStage(stage, front: track.ornament.layer == .front, text: layout)
        guard track.travels else { return base }
        return CallFrameOrnamentStage(
            size: base.size, unit: base.unit, zones: [stage.bounds], avoid: [], top: base.top, bottom: base.bottom,
            inner: base.inner, slots: base.slots, front: false, text: [], headline: base.headline
        )
    }

    /// Blanc partout, sauf dans les cases (la carte entière quand la case en porte une) et sous les textes.
    static func motionMask(_ stage: CallFrameStage, layout: CallFrameTextLayout) -> CGImage? {
        guard let context = CallMontageRenderer.makeContext(size: stage.size) else { return nil }
        context.setFillColor(CGColor(gray: 1, alpha: 1))
        context.fill(stage.bounds)
        context.setBlendMode(.clear)
        let style = stage.look.slot
        stage.boxes.forEach { box in
            let area = style.card == nil ? Painter.photoRect(box.rect, card: nil) : box.rect
            Painter.inBox(context, box) {
                context.addPath(Painter.slotPath(for: box, in: area, slot: style))
                context.fillPath()
            }
        }
        layout.boxes.forEach { context.fill($0.insetBy(dx: -stage.unit * 0.01, dy: -stage.unit * 0.01)) }
        return context.makeImage()
    }
}
