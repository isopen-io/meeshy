import SwiftUI
import UIKit
import MeeshySDK

// MARK: - Un Instant : le film, et son texte redessiné en natif (#9069)

/// **Un Instant de Mee ou Meo** — la même vue dans la feuille et dans la bulle.
///
/// Le film vient du web, tourné SANS ce qui dépend du texte ; le texte saisi
/// est posé par-dessus, en natif, à la place et avec les règles que l'index a
/// mesurées (`MeeInstantOverlay`).
public struct MeeInstantView: View {

    let instant: MeeInstant
    let slots: [MeeSlot: String]
    let side: CGFloat
    let animates: Bool
    let pixelCap: Int

    public init(instant: MeeInstant, slots: [MeeSlot: String], side: CGFloat,
                animates: Bool = true, pixelCap: Int = 360) {
        self.instant = instant
        self.slots = slots
        self.side = side
        self.animates = animates
        self.pixelCap = pixelCap
    }

    public var body: some View {
        ZStack {
            MeeStickerFilmView(filmID: instant.id, animated: instant.animated, side: side,
                               animates: animates, pixelCap: pixelCap)
            MeeInstantOverlay(instant: instant, slots: slots, side: side)
        }
        .frame(width: side, height: side)
    }
}

/// **Le texte d'un Instant**, dessiné dans le repère du film : la boîte de vue
/// du web (`MeeInstantCatalog.viewBox`) ramenée au côté de la vue.
public struct MeeInstantOverlay: View {

    let instant: MeeInstant
    let slots: [MeeSlot: String]
    let side: CGFloat

    public init(instant: MeeInstant, slots: [MeeSlot: String], side: CGFloat) {
        self.instant = instant
        self.slots = slots
        self.side = side
    }

    public var body: some View {
        Canvas { context, _ in
            let box = MeeInstantCatalog.viewBox
            let k = side / box.width
            context.translateBy(x: -box.minX * k, y: -box.minY * k)
            context.scaleBy(x: k, y: k)
            if let band = instant.band {
                drawBand(band, in: &context)
            }
            for text in instant.texts {
                drawFree(text, in: &context)
            }
        }
        .frame(width: side, height: side)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func drawBand(_ band: MeeInstant.Band, in context: inout GraphicsContext) {
        let layout = MeeInstantBandLayout(main: instant.shown(band.main, in: slots) ?? "",
                                          sub: band.sub.flatMap { instant.shown($0, in: slots) })
        let shape = Path(roundedRect: layout.rect, cornerRadius: layout.cornerRadius)
        context.fill(shape, with: .color(Color(hex: band.fill)))
        context.stroke(shape, with: .color(Color(hex: band.stroke)), lineWidth: 2.4)
        draw(layout.main, size: layout.mainSize, weight: .black, color: Color(hex: band.ink),
             at: CGPoint(x: 100, y: layout.mainBaseline), anchor: .middle, rotation: 0, in: &context)
        if let sub = layout.sub {
            draw(sub, size: layout.subSize, weight: .bold, color: Color(hex: band.ink).opacity(0.78),
                 at: CGPoint(x: 100, y: layout.subBaseline), anchor: .middle, rotation: 0, in: &context)
        }
    }

    private func drawFree(_ text: MeeInstant.FreeText, in context: inout GraphicsContext) {
        let raw = (instant.shown(text.slot, in: slots) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let shown = text.max.map { MeeInstantText.clip(raw, max: $0) } ?? raw
        draw(shown, size: text.size(forLength: raw.count) * text.scale, weight: Self.weight(text.weight),
             color: Color(hex: text.fill).opacity(text.opacity),
             at: CGPoint(x: text.x, y: text.y), anchor: text.anchor, rotation: text.rotation, in: &context)
    }

    /// Un texte posé par sa LIGNE DE BASE, comme un `<text>` SVG.
    private func draw(_ string: String, size: CGFloat, weight: Font.Weight, color: Color,
                      at point: CGPoint, anchor: MeeInstant.FreeText.Anchor, rotation: CGFloat,
                      in context: inout GraphicsContext) {
        guard !string.isEmpty else { return }
        let resolved = context.resolve(Text(string).font(.system(size: size, weight: weight)).foregroundColor(color))
        let measured = resolved.measure(in: CGSize(width: CGFloat.greatestFiniteMagnitude, height: .greatestFiniteMagnitude))
        let baseline = resolved.firstBaseline(in: measured)
        let left: CGFloat = switch anchor {
        case .start: 0
        case .middle: -measured.width / 2
        case .end: -measured.width
        }
        var local = context
        local.translateBy(x: point.x, y: point.y)
        local.rotate(by: .radians(rotation))
        local.draw(resolved, in: CGRect(origin: CGPoint(x: left, y: -baseline), size: measured))
    }

    static func weight(_ value: Int) -> Font.Weight {
        switch value {
        case 900...: .black
        case 800..<900: .heavy
        case 700..<800: .bold
        case 600..<700: .semibold
        default: .medium
        }
    }
}

private extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255)
    }
}

// MARK: - L'hôte qui ENVOIE un Instant

/// **Les Instants n'apparaissent dans « Personnalisés » que si un hôte sait
/// les envoyer** (loi 4) — la conversation, comme pour Mee & Meo.
public struct MeeInstantPickKey: EnvironmentKey {
    public static let defaultValue: ((MeeInstant, [MeeSlot: String]) -> Void)? = nil
}

extension EnvironmentValues {
    public var meeInstantPick: ((MeeInstant, [MeeSlot: String]) -> Void)? {
        get { self[MeeInstantPickKey.self] }
        set { self[MeeInstantPickKey.self] = newValue }
    }
}

extension View {
    public func meeInstantsProvided(onPick: @escaping (MeeInstant, [MeeSlot: String]) -> Void) -> some View {
        environment(\.meeInstantPick, onPick)
    }
}

// MARK: - L'image qui part avec le message

extension MeeInstant {

    /// **Le PNG joint** — le repli des clients qui ne redessinent pas : la
    /// première image du film, et le texte saisi posé dessus.
    @MainActor
    public func stillImage(slots typed: [MeeSlot: String], side: CGFloat = 360) -> UIImage? {
        guard let still = MeeStickerCatalog.stillImage(id: id) else { return nil }
        let renderer = ImageRenderer(content: ZStack {
            Image(uiImage: still).resizable().scaledToFit()
            MeeInstantOverlay(instant: self, slots: typed, side: side)
        }
        .frame(width: side, height: side))
        renderer.scale = 1
        return renderer.uiImage
    }
}
