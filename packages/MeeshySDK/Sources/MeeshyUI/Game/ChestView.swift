import SwiftUI

// MARK: - Le coffre du jour (#9380)
//
// MIROIR de `coffres` de `docs/product/jeu-meeshy-conception.html` (§ IV.4) : un
// coffre d'indigo, un bandeau d'or, la serrure à la Signature gravée. Fermé, son
// couvercle est un dôme ; ouvert, le couvercle se lève et trois étincelles d'or
// montent.
//
// `openProgress` va de 0 (fermé) à 1 (ouvert) et s'ANIME : le couvercle et les
// étincelles se fondent l'un dans l'autre sous `withAnimation`. La brique ne
// décide ni quand le coffre s'ouvre ni ce qui monte de lui (« les récompenses
// montent une à une ») : c'est la chorégraphie de l'app.

public struct ChestView: View {

    private let openProgress: Double
    private let accessibilityLabel: String?

    public init(openProgress: Double, accessibilityLabel: String? = nil) {
        self.openProgress = min(max(openProgress, 0), 1)
        self.accessibilityLabel = accessibilityLabel
    }

    public init(isOpen: Bool, accessibilityLabel: String? = nil) {
        self.init(openProgress: isOpen ? 1 : 0, accessibilityLabel: accessibilityLabel)
    }

    private static let closedLid = GameSVGPath.make("M10 34 a35 22 0 0 1 70 0 z")
    private static let openLid = GameSVGPath.make("M20 30 l-6 -20 62 0 -6 20")
    private static let sparkles = GameSVGPath.make("M30 18 l-4 -8 M45 14 V4 M60 18 l4 -8")
    private static let size = CGSize(width: 90, height: 72)

    public var body: some View {
        ZStack {
            layer { context in
                drawClosedLid(in: &context)
            }
            .opacity(1 - openProgress)

            layer { context in
                drawOpenLid(in: &context)
            }
            .opacity(openProgress)
            .offset(y: CGFloat(-3 * (1 - openProgress)))

            layer { context in
                drawBody(in: &context)
            }
        }
        .aspectRatio(Self.size.width / Self.size.height, contentMode: .fit)
        .gameAccessibility(label: accessibilityLabel)
    }

    private func layer(_ draw: @escaping (inout GraphicsContext) -> Void) -> some View {
        Canvas { context, size in
            let k = size.width / Self.size.width
            context.scaleBy(x: k, y: k)
            draw(&context)
        }
    }

    private func drawClosedLid(in context: inout GraphicsContext) {
        context.fill(Self.closedLid, with: .color(GamePalette.violet))
    }

    private func drawOpenLid(in context: inout GraphicsContext) {
        context.fill(Self.openLid, with: .color(GamePalette.violet.opacity(0.85)))
        context.stroke(Self.sparkles, with: .color(GamePalette.gold), style: StrokeStyle(lineWidth: 2, lineCap: .round))
    }

    private func drawBody(in context: inout GraphicsContext) {
        let body = Path(roundedRect: CGRect(x: 10, y: 30, width: 70, height: 36), cornerRadius: 6)
        context.fill(body, with: GamePalette.diagonal(GamePalette.indigo, in: body.boundingRect))
        let band = Path(CGRect(x: 10, y: 30, width: 70, height: 6))
        context.fill(band, with: GameMaterial.gold.shading(in: band.boundingRect))
        let lock = Path(roundedRect: CGRect(x: 35, y: 36, width: 20, height: 16), cornerRadius: 3)
        context.fill(lock, with: GameMaterial.gold.shading(in: lock.boundingRect))
        GameSignature.draw(in: &context, center: CGPoint(x: 45, y: 44), side: 15, color: GameMaterial.gold.ink,
                           style: .engraved, strokeWidth: 120)
    }
}
