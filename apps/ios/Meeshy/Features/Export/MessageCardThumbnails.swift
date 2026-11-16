import SwiftUI
import UIKit
import CoreText
import MeeshySDK
import MeeshyUI

/// **LES VIGNETTES DE LA GALERIE D'EXPORT** — miroir de
/// `apps/web/src/lib/export/message-card-thumbnails.ts`. Chaque template est
/// montré par sa VRAIE carte, peinte sur le message de l'utilisateur.
///
/// Une vignette coûte une peinture : elle ne se demande qu'à l'entrée à
/// l'écran (`LazyVGrid`), DEUX à la fois (`LatestFirstGate`), la PLUS RÉCENTE demande d'abord, et
/// jamais sur le MainActor. Le cache est BORNÉ (`countLimit`) et une clé nomme
/// le template ET l'état de la carte (langue, titre, anonymat) : changer un
/// détail ne ressert jamais une vignette périmée.
final class MessageCardThumbnailStore {
    private let cache = NSCache<NSString, UIImage>()
    private let gate = LatestFirstGate(limit: 2)

    init(limit: Int = 240) {
        cache.countLimit = limit
    }

    nonisolated deinit {}

    func cached(_ key: String) -> UIImage? {
        cache.object(forKey: key as NSString)
    }

    func image(_ key: String, input: MessageCardInput, width: Double, displayScale: Double, pictures: MessageCardPictures) async -> UIImage? {
        if let hit = cached(key) { return hit }
        guard await gate.enter() else { return nil }
        guard !Task.isCancelled else {
            await gate.leave()
            return nil
        }
        let image = await Task.detached(priority: .utility) {
            MessageCardRenderer.thumbnail(input, width: width, displayScale: displayScale, pictures: pictures)
        }.value
        await gate.leave()
        if let image { cache.setObject(image, forKey: key as NSString) }
        return image
    }
}

/// Ce qu'une vignette doit savoir pour se peindre dans l'état courant de la carte.
struct MessageCardThumbSource {
    let store: MessageCardThumbnailStore
    let keyOf: (MessageCardTemplateID) -> String
    let inputOf: (MessageCardTemplateID) -> MessageCardInput
    /// Les pixels des médias — la vignette montre la MÊME carte que l'image exportée.
    let pictures: MessageCardPictures
}

/// Une vignette de template — en attendant sa peinture, le fond de sa palette
/// et un « Aa » dans sa police : jamais un carré vide, jamais un saut.
///
/// La carte entière tient dans la tuile (#8692) : recadrée par le haut, une
/// carte haute perdait sa liaison — le séparateur vit au milieu.
struct MessageCardThumb: View {
    let id: MessageCardTemplateID
    let source: MessageCardThumbSource
    let selected: Bool
    let width: CGFloat
    let action: () -> Void

    @State private var image: UIImage?
    @Environment(\.displayScale) private var displayScale

    var body: some View {
        let key = source.keyOf(id)
        Button {
            HapticFeedback.light()
            action()
        } label: {
            ZStack(alignment: .top) {
                MessageCardSwatch(palette: id.palette.palette, shape: RoundedRectangle(cornerRadius: 12, style: .continuous))
                if let image = image ?? source.store.cached(key) {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .frame(width: width, height: width * 1.05)
                } else {
                    Text(verbatim: "Aa")
                        .font(MessageCardFontStyle.font(id.typeface.typeface.replyFace, size: 22))
                        .foregroundStyle(MessageCardFontStyle.color(id.palette.palette.replyInk))
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .frame(width: width, height: width * 1.05)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(selected ? Color.primary : Color.primary.opacity(0.08), lineWidth: selected ? 2.5 : 1)
            )
        }
        .buttonStyle(MessageCardPressStyle())
        .accessibilityLabel(MessageCardExportText.templateLabel(id))
        .accessibilityAddTraits(selected ? [.isSelected] : [])
        .task(id: key) {
            image = source.store.cached(key)
            guard image == nil else { return }
            let painted = await source.store.image(key, input: source.inputOf(id), width: Double(width), displayScale: Double(displayScale), pictures: source.pictures)
            if !Task.isCancelled { image = painted }
        }
    }
}

/// Le fond d'une palette, en dégradé — la pastille du panneau « Fond » et
/// l'attente d'une vignette.
struct MessageCardSwatch<S: Shape>: View {
    let palette: MessageCardPalette
    let shape: S

    var body: some View {
        shape.fill(LinearGradient(
            stops: palette.background.map { Gradient.Stop(color: MessageCardFontStyle.color($0.color), location: CGFloat($0.offset)) },
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        ))
    }
}

enum MessageCardFontStyle {
    static func font(_ face: MessageCardFace, size: Double) -> Font {
        Font(MessageCardRenderer.uiFont(MessageCardFont(face: face, size: size)) as CTFont)
    }

    static func color(_ color: MessageCardColor) -> Color {
        Color(.sRGB, red: color.red, green: color.green, blue: color.blue, opacity: color.alpha)
    }
}

/// Un appui qui s'enfonce — le retour immédiat d'une tuile.
struct MessageCardPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.95 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

/// **LA LIAISON POSÉE, EN PETIT** (#18809) — miroir de `linkSketch`
/// (`apps/web/src/routes/thread-export-link-sketch.ts`). Une case du choix de
/// liaison montre une carte miniature : la citation en haut, la réponse en bas
/// et, entre les deux, ce que la liaison y PEINT, dans les encres de la palette
/// choisie — jamais l'encre de l'interface, qu'un fond de palette pourrait avaler.
/// Les coordonnées vivent dans un carré de 50 × 50 ; la bande de la liaison est
/// `band` (la citation au-dessus, la réponse au-dessous).
struct MessageCardLinkSketch: Equatable {
    enum Ink: Equatable { case accent, quote, reply, quotePanel, replyPanel }

    enum Mark: Equatable {
        case line(x1: Double, y1: Double, x2: Double, y2: Double, width: Double, dash: [Double], ink: Ink)
        case dot(x: Double, y: Double, radius: Double, ink: Ink)
        case ring(x: Double, y: Double, radius: Double, ink: Ink)
        case panel(x: Double, y: Double, width: Double, height: Double, ink: Ink)
        case diamond(x: Double, y: Double, radius: Double, ink: Ink)
        case arrow(x: Double, top: Double, bottom: Double, end: Double, ink: Ink)
        case glyph(String, x: Double, y: Double, size: Double, serif: Bool, ink: Ink)

        var ink: Ink {
            switch self {
            case let .line(_, _, _, _, _, _, ink), let .dot(_, _, _, ink), let .ring(_, _, _, ink),
                 let .panel(_, _, _, _, ink), let .diamond(_, _, _, ink), let .arrow(_, _, _, _, ink),
                 let .glyph(_, _, _, _, _, ink):
                return ink
            }
        }
    }

    static let side: Double = 50
    static let band: ClosedRange<Double> = 17...33

    let quote: [Mark]
    let link: [Mark]
    let reply: [Mark]

    var marks: [Mark] { quote + link + reply }

    static func of(_ link: MessageCardLinkID) -> MessageCardLinkSketch {
        MessageCardLinkSketch(quote: quoteMarks(link), link: linkMarks(link), reply: replyMarks(link))
    }

    private static func hasQuoteBar(_ link: MessageCardLinkID) -> Bool {
        [.orbite, .filet, .fleche, .fil].contains(link)
    }

    private static func quoteMarks(_ link: MessageCardLinkID) -> [Mark] {
        if link == .bulles {
            return [
                .panel(x: 5, y: 4, width: 30, height: 13, ink: .quotePanel),
                .line(x1: 10, y1: 10.5, x2: 29, y2: 10.5, width: 2, dash: [], ink: .quote),
            ]
        }
        let start: Double = hasQuoteBar(link) ? 14 : 8
        let bar: [Mark] = hasQuoteBar(link) ? [.line(x1: 9, y1: 6, x2: 9, y2: 15, width: 2, dash: [], ink: .accent)] : []
        return bar + [
            .line(x1: start, y1: 8, x2: 40, y2: 8, width: 2, dash: [], ink: .quote),
            .line(x1: start, y1: 13, x2: 32, y2: 13, width: 2, dash: [], ink: .quote),
        ]
    }

    private static func replyMarks(_ link: MessageCardLinkID) -> [Mark] {
        if link == .bulles {
            return [
                .panel(x: 15, y: 33, width: 30, height: 13, ink: .replyPanel),
                .line(x1: 20, y1: 39.5, x2: 40, y2: 39.5, width: 2.6, dash: [], ink: .reply),
            ]
        }
        return [
            .line(x1: 8, y1: 37, x2: 42, y2: 37, width: 2.6, dash: [], ink: .reply),
            .line(x1: 8, y1: 42.5, x2: 33, y2: 42.5, width: 2.6, dash: [], ink: .reply),
        ]
    }

    private static func linkMarks(_ link: MessageCardLinkID) -> [Mark] {
        switch link {
        case .orbite:
            return [
                .line(x1: 6, y1: 25, x2: 20, y2: 25, width: 1.8, dash: [1, 3.5], ink: .accent),
                .ring(x: 25, y: 25, radius: 3, ink: .accent),
                .line(x1: 30, y1: 25, x2: 44, y2: 25, width: 1.8, dash: [1, 3.5], ink: .accent),
            ]
        case .filet: return [.line(x1: 8, y1: 25, x2: 24, y2: 25, width: 3, dash: [], ink: .accent)]
        case .guillemets: return [.glyph("“", x: 13, y: 26, size: 26, serif: true, ink: .accent)]
        case .fleche: return [.arrow(x: 12, top: 19, bottom: 27, end: 28, ink: .accent)]
        case .bulles, .silence: return []
        case .fil:
            return [
                .line(x1: 9, y1: 18, x2: 9, y2: 27, width: 2, dash: [], ink: .accent),
                .dot(x: 9, y: 30, radius: 2.2, ink: .accent),
            ]
        case .points: return [19.0, 25, 31].map { .dot(x: $0, y: 25, radius: 1.9, ink: .accent) }
        case .losange:
            return [
                .line(x1: 8, y1: 25, x2: 19, y2: 25, width: 1.6, dash: [], ink: .accent),
                .diamond(x: 25, y: 25, radius: 3.6, ink: .accent),
                .line(x1: 31, y1: 25, x2: 42, y2: 25, width: 1.6, dash: [], ink: .accent),
            ]
        case .asterisme: return [.glyph("⁂", x: 25, y: 25, size: 15, serif: false, ink: .accent)]
        case .double:
            return [
                .line(x1: 8, y1: 23, x2: 42, y2: 23, width: 1.5, dash: [], ink: .accent),
                .line(x1: 8, y1: 27.5, x2: 42, y2: 27.5, width: 1.5, dash: [], ink: .accent),
            ]
        }
    }
}

/// Une case du choix de liaison : la liaison posée sur une carte miniature de
/// la palette choisie.
struct MessageCardLinkGlyph: View {
    let link: MessageCardLinkID
    var palette: MessageCardPalette = MessageCardPaletteID.aurore.palette

    var body: some View {
        let sketch = MessageCardLinkSketch.of(link)
        let palette = palette
        Canvas { context, size in
            let scale = min(size.width, size.height) / MessageCardLinkSketch.side
            for mark in sketch.marks { Self.paint(mark, in: &context, scale: scale, palette: palette) }
        }
        .frame(width: 48, height: 48)
        .background(MessageCardSwatch(palette: palette, shape: RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous)))
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous))
        .environment(\.layoutDirection, .leftToRight)
        .accessibilityHidden(true)
    }

    static func color(_ ink: MessageCardLinkSketch.Ink, of palette: MessageCardPalette) -> Color {
        switch ink {
        case .accent: return MessageCardFontStyle.color(palette.accent)
        case .quote: return MessageCardFontStyle.color(palette.quoteInk)
        case .reply: return MessageCardFontStyle.color(palette.replyInk)
        case .quotePanel: return MessageCardFontStyle.color(palette.quotePanel)
        case .replyPanel: return MessageCardFontStyle.color(palette.replyPanel)
        }
    }

    private static func paint(_ mark: MessageCardLinkSketch.Mark, in context: inout GraphicsContext, scale: Double, palette: MessageCardPalette) {
        func p(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: x * scale, y: y * scale) }
        let ink = GraphicsContext.Shading.color(color(mark.ink, of: palette))
        switch mark {
        case let .line(x1, y1, x2, y2, width, dash, _):
            var path = Path()
            path.move(to: p(x1, y1)); path.addLine(to: p(x2, y2))
            context.stroke(path, with: ink, style: StrokeStyle(lineWidth: width * scale, lineCap: .round, dash: dash.map { $0 * scale }))
        case let .dot(x, y, radius, _):
            context.fill(Path(ellipseIn: CGRect(x: (x - radius) * scale, y: (y - radius) * scale, width: 2 * radius * scale, height: 2 * radius * scale)), with: ink)
        case let .ring(x, y, radius, _):
            context.stroke(Path(ellipseIn: CGRect(x: (x - radius) * scale, y: (y - radius) * scale, width: 2 * radius * scale, height: 2 * radius * scale)), with: ink, lineWidth: 1.6 * scale)
        case let .panel(x, y, width, height, _):
            context.fill(Path(roundedRect: CGRect(x: x * scale, y: y * scale, width: width * scale, height: height * scale), cornerRadius: height / 2 * scale), with: ink)
        case let .diamond(x, y, radius, _):
            var path = Path()
            path.move(to: p(x, y - radius)); path.addLine(to: p(x + radius, y)); path.addLine(to: p(x, y + radius)); path.addLine(to: p(x - radius, y)); path.closeSubpath()
            context.fill(path, with: ink)
        case let .arrow(x, top, bottom, end, _):
            var path = Path()
            path.move(to: p(x, top)); path.addLine(to: p(x, bottom - 3))
            path.addQuadCurve(to: p(x + 3, bottom), control: p(x, bottom))
            path.addLine(to: p(end, bottom))
            path.move(to: p(end - 4, bottom - 4)); path.addLine(to: p(end, bottom)); path.addLine(to: p(end - 4, bottom + 4))
            context.stroke(path, with: ink, style: StrokeStyle(lineWidth: 2 * scale, lineCap: .round, lineJoin: .round))
        case let .glyph(text, x, y, size, serif, _):
            let face: MessageCardFace = serif ? MessageCardTemplates.guillemetFace : .system(700)
            var label = context.resolve(Text(verbatim: text).font(MessageCardFontStyle.font(face, size: size * scale)))
            label.shading = ink
            context.draw(label, at: p(x, y), anchor: .center)
        }
    }
}
