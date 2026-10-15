import SwiftUI
import MeeshySDK

// MARK: - AppearanceDesignView (#10631, spec §§ 5.1, 8.2)
//
// Un building block AGNOSTIQUE : il prend un `AppearanceDesign`, le schéma et
// l'accent effectif, et peint — jamais de singleton Meeshy, jamais de décision
// « quel fond, quand » (l'orchestration est app-side). Motif : une tuile rendue
// une fois (cache borné) puis répétée ; illustration et dégradé : `Canvas`.
// Équatable : un fond ne se redessine que si (modèle, schéma, accent) change.

public struct AppearanceDesignView: View, Equatable {
    public let design: AppearanceDesign
    public let isDark: Bool
    public let accentHex: String

    @Environment(\.displayScale) private var displayScale
    @Environment(\.layoutDirection) private var layoutDirection

    public init(design: AppearanceDesign, isDark: Bool, accentHex: String) {
        self.design = design
        self.isDark = isDark
        self.accentHex = accentHex
    }

    nonisolated public static func == (lhs: AppearanceDesignView, rhs: AppearanceDesignView) -> Bool {
        lhs.design == rhs.design && lhs.isDark == rhs.isDark && lhs.accentHex == rhs.accentHex
    }

    private var palette: AppearanceDesignPalette { design.palette(isDark ? .dark : .light) }

    public var body: some View {
        ZStack {
            Color(hex: palette.base)
            switch design.style {
            case .pattern: patternLayer
            case .illustration: illustrationLayer
            case .gradient: gradientLayer
            }
        }
        .accessibilityHidden(true)
    }

    // MARK: Motif

    @ViewBuilder private var patternLayer: some View {
        if let tile = design.tile,
           let image = AppearanceTileRenderer.tileImage(design: design, isDark: isDark, accentHex: accentHex, displayScale: displayScale) {
            GeometryReader { geo in
                // Une rotation découvre des coins : la couche est agrandie de la diagonale, puis rognée.
                let spread = tile.rotation == 0 ? 1 : 1.5
                Image(uiImage: image)
                    .resizable(resizingMode: .tile)
                    .frame(width: geo.size.width * spread, height: geo.size.height * spread)
                    .rotationEffect(.degrees(tile.rotation))
                    .position(x: geo.size.width / 2, y: geo.size.height / 2)
            }
            .clipped()
        }
    }

    // MARK: Illustration

    @ViewBuilder private var illustrationLayer: some View {
        if let scene = design.scene, scene.width > 0, scene.height > 0 {
            let palette = palette
            let accentHex = accentHex
            let isRTL = layoutDirection == .rightToLeft
            Canvas { context, size in
                let scale = min(size.width / scene.width, size.height / scene.height)
                let drawn = CGSize(width: scene.width * scale, height: scene.height * scale)
                let origin = Self.origin(anchor: scene.anchor, drawn: drawn, in: size, isRTL: isRTL)
                for stroke in scene.paths {
                    var path = SVGPathData.make(stroke.d)
                    path = path.applying(CGAffineTransform(scaleX: scale, y: scale).concatenating(CGAffineTransform(translationX: origin.x, y: origin.y)))
                    let color = AppearancePaint.color(stroke.role, palette: palette, accentHex: accentHex).opacity(stroke.opacity)
                    if let width = stroke.width {
                        context.stroke(path, with: .color(color), lineWidth: width * scale)
                    } else {
                        context.fill(path, with: .color(color))
                    }
                }
            }
        }
    }

    /// Le coin haut-gauche du dessin : `bottom` centré en bas, `center` centré,
    /// `bottom-end` au bord de FIN (miroir en RTL).
    nonisolated static func origin(anchor: AppearanceSceneAnchor, drawn: CGSize, in size: CGSize, isRTL: Bool) -> CGPoint {
        switch anchor {
        case .bottom: return CGPoint(x: (size.width - drawn.width) / 2, y: size.height - drawn.height)
        case .center: return CGPoint(x: (size.width - drawn.width) / 2, y: (size.height - drawn.height) / 2)
        case .bottomEnd: return CGPoint(x: isRTL ? 0 : size.width - drawn.width, y: size.height - drawn.height)
        }
    }

    // MARK: Dégradé

    @ViewBuilder private var gradientLayer: some View {
        if let gradient = design.gradient {
            let palette = palette
            let accentHex = accentHex
            Canvas { context, size in
                let rect = CGRect(origin: .zero, size: size)
                let radians = gradient.angle * .pi / 180
                let dx = sin(radians) / 2
                let dy = -cos(radians) / 2
                let stops = gradient.stops.map {
                    Gradient.Stop(color: AppearancePaint.color($0.role, palette: palette, accentHex: accentHex), location: $0.at)
                }
                context.fill(
                    Path(rect),
                    with: .linearGradient(
                        Gradient(stops: stops),
                        startPoint: CGPoint(x: (0.5 - dx) * size.width, y: (0.5 - dy) * size.height),
                        endPoint: CGPoint(x: (0.5 + dx) * size.width, y: (0.5 + dy) * size.height)
                    )
                )
                let reach = max(size.width, size.height)
                for blob in gradient.blobs {
                    let color = AppearancePaint.color(blob.role, palette: palette, accentHex: accentHex)
                    let center = CGPoint(x: blob.x * size.width, y: blob.y * size.height)
                    let radius = blob.r * reach
                    context.fill(
                        Path(ellipseIn: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2)),
                        with: .radialGradient(
                            Gradient(colors: [color.opacity(blob.opacity), color.opacity(0)]),
                            center: center, startRadius: 0, endRadius: radius
                        )
                    )
                }
            }
        }
    }
}
