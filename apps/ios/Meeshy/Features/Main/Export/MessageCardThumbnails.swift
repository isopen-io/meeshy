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
/// l'écran (`LazyVGrid`), DEUX à la fois, la PLUS RÉCENTE demande d'abord, et
/// jamais sur le MainActor. Le cache est BORNÉ (`countLimit`) et une clé nomme
/// le template ET l'état de la carte (langue, titre, anonymat) : changer un
/// détail ne ressert jamais une vignette périmée.
final class MessageCardThumbnailStore {
    private let cache = NSCache<NSString, UIImage>()
    private let gate = MessageCardRenderGate(limit: 2)

    init(limit: Int = 240) {
        cache.countLimit = limit
    }

    nonisolated deinit {}

    func cached(_ key: String) -> UIImage? {
        cache.object(forKey: key as NSString)
    }

    func image(_ key: String, input: MessageCardInput, width: Double, displayScale: Double) async -> UIImage? {
        if let hit = cached(key) { return hit }
        await gate.enter()
        guard !Task.isCancelled else {
            await gate.leave()
            return nil
        }
        let image = await Task.detached(priority: .utility) {
            MessageCardRenderer.thumbnail(input, width: width, displayScale: displayScale)
        }.value
        await gate.leave()
        if let image { cache.setObject(image, forKey: key as NSString) }
        return image
    }
}

/// Au plus `limit` peintures à la fois ; la dernière demandée passe d'abord.
actor MessageCardRenderGate {
    private let limit: Int
    private var running = 0
    private var waiting: [CheckedContinuation<Void, Never>] = []

    init(limit: Int) {
        self.limit = limit
    }

    func enter() async {
        guard running >= limit else {
            running += 1
            return
        }
        await withCheckedContinuation { waiting.append($0) }
    }

    func leave() {
        guard let next = waiting.popLast() else {
            running -= 1
            return
        }
        next.resume()
    }
}

/// Ce qu'une vignette doit savoir pour se peindre dans l'état courant de la carte.
struct MessageCardThumbSource {
    let store: MessageCardThumbnailStore
    let keyOf: (MessageCardTemplateID) -> String
    let inputOf: (MessageCardTemplateID) -> MessageCardInput
}

/// Une vignette de template — en attendant sa peinture, le fond de sa palette
/// et un « Aa » dans sa police : jamais un carré vide, jamais un saut.
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
                        .scaledToFill()
                        .frame(width: width, height: width * 1.05, alignment: .top)
                        .clipped()
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
            let painted = await source.store.image(key, input: source.inputOf(id), width: Double(width), displayScale: Double(displayScale))
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

/// Le dessin d'une liaison, en petit : ce qu'elle PEINT entre la question et la réponse.
struct MessageCardLinkGlyph: View {
    let link: MessageCardLinkID

    var body: some View {
        Canvas { context, size in
            let sx = size.width / 50
            let sy = size.height / 34
            func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * sx, y: y * sy) }
            let stroke = StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round)
            let ink = GraphicsContext.Shading.foreground
            var path = Path()
            switch link {
            case .orbite:
                path.move(to: point(4, 17)); path.addLine(to: point(18, 17))
                path.move(to: point(32, 17)); path.addLine(to: point(46, 17))
                context.stroke(path, with: ink, style: StrokeStyle(lineWidth: 2.2, lineCap: .round, dash: [1 * sx, 5 * sx]))
                context.stroke(Path(ellipseIn: CGRect(x: 21 * sx, y: 17 * sy - 4 * sx, width: 8 * sx, height: 8 * sx)), with: ink, style: stroke)
            case .filet:
                path.move(to: point(6, 17)); path.addLine(to: point(22, 17))
                context.stroke(path, with: ink, style: StrokeStyle(lineWidth: 3.4, lineCap: .round))
            case .guillemets:
                context.draw(Text(verbatim: "“").font(MessageCardFontStyle.font(MessageCardTemplates.guillemetFace, size: 36)), at: point(14, 20))
            case .fleche:
                path.move(to: point(12, 6)); path.addLine(to: point(12, 14))
                path.addQuadCurve(to: point(16, 18), control: point(12, 18))
                path.addLine(to: point(30, 18))
                path.move(to: point(25, 13)); path.addLine(to: point(30, 18)); path.addLine(to: point(25, 23))
                context.stroke(path, with: ink, style: stroke)
            case .bulles:
                context.stroke(Path(roundedRect: CGRect(x: 3 * sx, y: 4 * sy, width: 28 * sx, height: 11 * sy), cornerRadius: 5.5 * sy), with: ink, style: stroke)
                context.stroke(Path(roundedRect: CGRect(x: 19 * sx, y: 19 * sy, width: 28 * sx, height: 11 * sy), cornerRadius: 5.5 * sy), with: ink, style: stroke)
            case .fil:
                path.move(to: point(10, 3)); path.addLine(to: point(10, 24))
                context.stroke(path, with: ink, style: stroke)
                context.fill(Path(ellipseIn: CGRect(x: 10 * sx - 3.2 * sy, y: 28 * sy - 3.2 * sy, width: 6.4 * sy, height: 6.4 * sy)), with: ink)
            case .silence:
                path.move(to: point(8, 17)); path.addLine(to: point(42, 17))
                context.opacity = 0.4
                context.stroke(path, with: ink, style: StrokeStyle(lineWidth: 2.2, lineCap: .round, dash: [2 * sx, 5 * sx]))
            }
        }
        .frame(width: 46, height: 30)
        .accessibilityHidden(true)
    }
}
