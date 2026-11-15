import SwiftUI

// MARK: - Les deux faces de la Meesh (épopée § 6, #11176)
//
// L'AVERS, pour toutes les éditions : la couronne UNIVERSELLE « MEESHY · 1 MEESH » (jamais traduite ; l'or remplace
// ses points par de petites étoiles) et la Signature frappée. Le REVERS : l'oiseau ou les oiseaux de l'édition, gravés
// et colorés (#9540) — Mee (argent), Meo (or), Mee et Meo face à face (prisme) —, la couronne royale du prisme, les
// lauriers de l'or, « Nº » (le o monté et SOULIGNÉ, le nombre en petit) et l'année.

extension MeeshCoinPainter {

    // MARK: Avers

    func drawObverse(in context: inout GraphicsContext) {
        drawInscription(in: &context)
        GameSignature.draw(in: &context, center: CGPoint(x: geometry.center, y: geometry.center),
                           side: geometry.signature.size, color: ink, style: .struck,
                           strokeWidth: geometry.signature.strokeWidth)
    }

    /// Chaque glyphe posé et tourné à sa place — SVG pose ses `<text>` de la même façon.
    private func drawInscription(in context: inout GraphicsContext) {
        let starred = edition.separator == .star
        var stars = Path()
        for glyph in MeeshCoinLayout.inscription(geometry) {
            if starred && glyph.isSeparator {
                stars.addPath(MeeshCoinLayout.closed(MeeshCoinLayout.star(at: glyph, geometry: geometry)))
                continue
            }
            var local = context
            local.translateBy(x: glyph.point.x, y: glyph.point.y)
            local.rotate(by: .degrees(Double(glyph.rotate)))
            local.draw(
                Text(String(glyph.glyph))
                    .font(.system(size: geometry.inscription.fontSize, weight: .semibold, design: .monospaced))
                    .foregroundColor(ink),
                at: .zero, anchor: .center
            )
        }
        if starred { context.fill(stars, with: .color(ink)) }
    }

    // MARK: Revers

    func drawReverse(number: Int, year: Int, in context: inout GraphicsContext) {
        for bird in edition.birds {
            GameEngravedBirds.draw(bird.bird, in: &context, origin: CGPoint(x: bird.x, y: bird.y), scale: bird.scale,
                                   flipped: bird.flip)
        }
        if has(.crown) { drawRoyalCrown(in: &context) }
        if has(.laurels) { drawLaurels(in: context) }
        drawNumber(number, in: &context)
        context.draw(
            Text(String(year)).font(.system(size: geometry.year.fontSize, weight: .medium, design: .monospaced))
                .kerning(geometry.year.letterSpacing).foregroundColor(ink),
            at: CGPoint(x: geometry.center, y: geometry.year.y), anchor: .center
        )
    }

    private func drawRoyalCrown(in context: inout GraphicsContext) {
        let crown = geometry.decor.crown
        for d in [crown.body, crown.band] {
            let path = GameSVGPath.make(d)
            context.fill(path, with: GameMaterial.gold.shading(in: path.boundingRect))
            context.stroke(path, with: .color(ink), style: StrokeStyle(lineWidth: crown.width, lineJoin: .round))
        }
        for jewel in crown.jewels {
            let gem = Path(ellipseIn: CGRect(x: jewel.x - jewel.r, y: jewel.y - jewel.r, width: jewel.r * 2, height: jewel.r * 2))
            context.fill(gem, with: GamePalette.diagonal(GamePalette.diamond, in: gem.boundingRect))
            context.stroke(gem, with: .color(ink), lineWidth: crown.width * 0.6)
        }
    }

    /// Deux rameaux encadrent le numéro : la branche gauche est décrite, la droite est son miroir autour de `mirrorX`.
    private func drawLaurels(in context: GraphicsContext) {
        let laurels = geometry.decor.laurels
        var leaves = Path()
        laurels.leaves.forEach { leaves.addPath(MeeshCoinLayout.leaf($0).path) }
        let stem = GameSVGPath.make(laurels.stem)
        var group = context
        group.opacity = 0.85
        for mirrored in [false, true] {
            var local = group
            if mirrored {
                local.translateBy(x: laurels.mirrorX * 2, y: 0)
                local.scaleBy(x: -1, y: 1)
            }
            local.stroke(stem, with: .color(ink), style: StrokeStyle(lineWidth: laurels.stemWidth, lineCap: .round))
            local.fill(leaves, with: .color(ink))
        }
    }

    /// « Nº » : le N, le o MONTÉ et SOULIGNÉ, puis le nombre en petit, redescendu sur la ligne de base — le tout centré
    /// sur l'axe de la pièce, comme le `text-anchor="middle"` du web.
    private func drawNumber(_ value: Int, in context: inout GraphicsContext) {
        let spec = geometry.number
        func resolve(_ text: Text, size: CGFloat) -> GraphicsContext.ResolvedText {
            context.resolve(text.font(.system(size: size, weight: .heavy)).foregroundColor(ink))
        }
        let parts: [(text: GraphicsContext.ResolvedText, rise: CGFloat, gap: CGFloat)] = [
            (resolve(Text(spec.sign), size: spec.signSize), 0, 0),
            (resolve(Text(spec.ordinal).underline(), size: spec.ordinalSize), spec.ordinalRise, 0),
            (resolve(Text(String(value)), size: spec.valueSize), 0, spec.valueGap),
        ]
        let unbounded = CGSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        let widths = parts.map { $0.text.measure(in: unbounded).width }
        var x = geometry.center - (widths.reduce(0, +) + parts.reduce(0) { $0 + $1.gap }) / 2
        for (part, width) in zip(parts, widths) {
            x += part.gap
            let baseline = part.text.firstBaseline(in: unbounded)
            context.draw(part.text, at: CGPoint(x: x, y: spec.y - part.rise - baseline), anchor: .topLeading)
            x += width
        }
    }
}
