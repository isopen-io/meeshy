import CoreGraphics
import Foundation

/// **Écran et Mosaïque d'une photo seule** (#12589). Le trou (ou la photo) se peint d'abord, puis le
/// décor qui doit le recouvrir — reflet, voile, barre d'état, joints, teintes, signature — PAR-DESSUS :
/// le calque de la carte graphique les porte donc comme le rendu direct d'un appel.
nonisolated extension CallMontageRenderer {

    static func drawScreenSolo(_ context: CGContext, bounds: CGRect, placed: Placed, caption: CallMontageCaption) {
        let solo = CallMontageSoloLayout.screen(in: bounds)
        let reach = min(bounds.width, bounds.height)
        fill(context, bounds, gray: 0)
        paintRim(context, bounds: bounds)
        placed.forEach { drawPortrait(context, $0.1, in: $0.0) }
        context.saveGState()
        context.addPath(CGPath(roundedRect: solo.screen, cornerWidth: solo.cornerRadius, cornerHeight: solo.cornerRadius, transform: nil))
        context.clip()
        paintReflection(context, points: solo.reflection)
        linearGradient(context, CGRect(x: solo.screen.minX, y: solo.screen.minY, width: solo.screen.width, height: solo.statusBand.height * 1.6),
                       top: CGColor(gray: 0, alpha: 0.35), bottom: CGColor(gray: 0, alpha: 0))
        context.restoreGState()
        paintStatusBar(context, solo: solo, caption: caption, reach: reach)
    }

    static func drawMosaicSolo(_ context: CGContext, bounds: CGRect, placed: Placed) {
        let mosaic = CallMontageSoloLayout.mosaic(in: bounds)
        fill(context, bounds, color: rgb(0.06, 0.06, 0.1))
        placed.forEach { drawPortrait(context, $0.1, in: $0.0) }
        context.saveGState()
        if let slot = placed.first?.0 { context.addPath(path(for: slot)); context.clip() }
        paintTints(context, mosaic: mosaic)
        paintJoints(context, mosaic: mosaic)
        context.restoreGState()
        let brand = CallFrameBrand(mark: .both, place: .bottom, color: "#FFFFFF", size: .m, font: nil)
        let fonts = CallFrameFontBook()
        let box = CallFrameRenderer.brandBox(brand, unit: min(bounds.width, bounds.height), fonts: fonts)
        CallFrameRenderer.paintBrandAt(context, brand: brand, box: box, cx: mosaic.band.midX, cy: mosaic.band.midY, scale: 1, fonts: fonts)
    }

    // MARK: - Écran

    /// Le liseré du boîtier : le coin du boîtier se lit sur le noir du bord.
    private static func paintRim(_ context: CGContext, bounds: CGRect) {
        let width = bounds.width * 0.004
        let body = bounds.insetBy(dx: width / 2, dy: width / 2)
        let radius = bounds.width * CallMontageSoloLayout.bodyRadius - width / 2
        context.saveGState()
        context.addPath(CGPath(roundedRect: body, cornerWidth: radius, cornerHeight: radius, transform: nil))
        context.setStrokeColor(CGColor(gray: 0.28, alpha: 1))
        context.setLineWidth(width)
        context.strokePath()
        context.restoreGState()
    }

    private static func paintReflection(_ context: CGContext, points: [CGPoint]) {
        guard let first = points.first else { return }
        context.saveGState()
        context.move(to: first)
        points.dropFirst().forEach { context.addLine(to: $0) }
        context.closePath()
        context.setFillColor(white(0.06))
        context.fillPath()
        context.restoreGState()
    }

    /// L'heure de la séance à gauche, la signature à droite — hors des coins arrondis de l'écran.
    private static func paintStatusBar(_ context: CGContext, solo: CallMontageSoloLayout.Screen, caption: CallMontageCaption, reach: CGFloat) {
        let band = solo.statusBand
        let inset = solo.cornerRadius * 0.75
        if let clock = caption.clock, !clock.isEmpty {
            let size = band.height * 0.5
            drawText(context, clock, font: "AvenirNext-DemiBold", size: size, color: white(1),
                     left: solo.screen.minX + inset, baseline: band.midY + size * 0.35, maxWidth: solo.screen.width * 0.3)
        }
        let brand = CallFrameBrand(mark: .both, place: .topRight, color: "#FFFFFF", size: .s, font: nil)
        let fonts = CallFrameFontBook()
        let box = CallFrameRenderer.brandBox(brand, unit: reach, fonts: fonts)
        CallFrameRenderer.paintBrandAt(context, brand: brand, box: box, cx: solo.screen.maxX - inset - box.width / 2,
                                       cy: band.midY, scale: 1, fonts: fonts)
    }

    // MARK: - Mosaïque

    private static func paintTints(_ context: CGContext, mosaic: CallMontageSoloLayout.Mosaic) {
        mosaic.tiles.enumerated().forEach { index, tile in
            let tint = CallMontageSoloLayout.tint(row: index / mosaic.columns, column: index % mosaic.columns)
            guard tint.alpha > 0 else { return }
            context.setFillColor(CGColor(red: tint.rgb.red, green: tint.rgb.green, blue: tint.rgb.blue, alpha: tint.alpha))
            context.fill(tile)
        }
    }

    private static func paintJoints(_ context: CGContext, mosaic: CallMontageSoloLayout.Mosaic) {
        context.setFillColor(white(0.95))
        let tiles = mosaic.tiles
        (1 ..< max(mosaic.columns, 1)).forEach { column in
            context.fill(CGRect(x: tiles[column - 1].maxX, y: mosaic.slot.minY, width: mosaic.joint, height: mosaic.slot.height))
        }
        (1 ..< max(mosaic.rows, 1)).forEach { row in
            context.fill(CGRect(x: mosaic.slot.minX, y: tiles[(row - 1) * mosaic.columns].maxY, width: mosaic.slot.width, height: mosaic.joint))
        }
    }
}
