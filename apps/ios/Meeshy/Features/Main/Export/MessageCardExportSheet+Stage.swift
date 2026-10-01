import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

/// Un pincement en cours sur une partie de l'aperçu (#8979) — son facteur est
/// relatif au début du geste. `fromZone` : le geste est né sur la zone de la
/// partie, et non sur la carte entière (doigts posés sur deux zones).
struct MessageCardPinch: Equatable {
    let part: MessageCardPartID
    var factor: CGFloat
    let fromZone: Bool
}

// MARK: - L'aperçu : chaque partie se touche, et se pince (#8979)

extension MessageCardExportSheet {

    /// La tolérance du doigt autour d'une zone, en points d'écran.
    static var touchSlop: CGFloat { MeeshySpacing.sm }
    /// Le pas d'un réglage d'échelle au lecteur d'écran.
    static let scaleStep: Double = 1.1

    /// La carte et ses zones. Les zones sont posées en pixels de la carte, depuis
    /// son coin haut-GAUCHE : la géométrie de l'aperçu reste gauche-à-droite dans
    /// toutes les langues, comme l'image qu'elle recouvre — retournée en arabe,
    /// chaque zone (et chaque pincement) tomberait sur la partie d'en face.
    func card(_ rendered: Rendered, in space: CGSize) -> some View {
        let ratio = rendered.size.width / max(rendered.size.height, 1)
        let width = min(space.width, space.height * ratio)
        let height = width / ratio
        let scale = width / rendered.size.width
        return ZStack(alignment: .topLeading) {
            Button { pick(.background) } label: {
                Image(uiImage: rendered.image)
                    .resizable()
                    .frame(width: width, height: height)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(MessageCardExportText.partLabel(.background))
            .accessibilityHint(MessageCardExportText.text("export.card.hint", "Touchez une partie de la carte pour la régler"))
            ForEach(Array(rendered.regions.enumerated()), id: \.offset) { _, region in
                zone(region, scale: scale)
            }
            if let pinch {
                pinchPreview(pinch, rendered: rendered, scale: scale)
            }
        }
        .frame(width: width, height: height)
        .environment(\.layoutDirection, .leftToRight)
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lgPlus, style: .continuous))
        .shadow(color: .black.opacity(0.22), radius: 18, y: 8)
        .opacity(ready || pinch != nil ? 1 : 0.7)
        .animation(.easeInOut(duration: 0.2), value: ready)
        .gesture(cardPinch)
    }

    private func zone(_ region: MessageCardRegion, scale: CGFloat) -> some View {
        let slop = Self.touchSlop
        let focused = focus == region.part
        let scalable = MessageCardScales.parts.contains(region.part)
        return Button { pick(region.part) } label: {
            RoundedRectangle(cornerRadius: MeeshyRadius.smPlus, style: .continuous)
                .fill(Color.white.opacity(0.001))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.smPlus, style: .continuous)
                        .strokeBorder(Color.white.opacity(focused ? 0.9 : 0), style: StrokeStyle(lineWidth: MeeshyBorder.strong, dash: [6, 4]))
                )
                .overlay(alignment: .topLeading) {
                    if focused && pinch == nil {
                        Text(MessageCardExportText.partLabel(region.part))
                            .font(.caption2.weight(.semibold))
                            .padding(.horizontal, MeeshySpacing.sm)
                            .padding(.vertical, MeeshySpacing.xs)
                            .adaptiveGlass(in: Capsule())
                            .offset(x: 6, y: -12)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .frame(width: CGFloat(region.width) * scale + 2 * slop, height: CGFloat(region.height) * scale + 2 * slop)
        .offset(x: CGFloat(region.x) * scale - slop, y: CGFloat(region.y) * scale - slop)
        .simultaneousGesture(zonePinch(region.part), including: scalable ? .all : .subviews)
        .accessibilityLabel(MessageCardExportText.partLabel(region.part))
        .accessibilityAddTraits(focused ? [.isSelected] : [])
        .modifier(MessageCardScaleAccessibility(
            scalable: scalable,
            value: format.disposition.scales[region.part],
            adjust: { factor in rescale(region.part, by: factor) }
        ))
    }

    // MARK: - Pincement

    /// Pincer une zone règle SA partie.
    private func zonePinch(_ part: MessageCardPartID) -> some Gesture {
        MagnificationGesture()
            .onChanged { value in pinch = MessageCardPinch(part: part, factor: value, fromZone: true) }
            .onEnded { value in
                pinch = nil
                rescale(part, by: Double(value))
            }
    }

    /// Les doigts posés sur deux zones : le pincement règle la partie désignée.
    private var cardPinch: some Gesture {
        MagnificationGesture()
            .onChanged { value in
                guard pinch?.fromZone != true, let part = focus, MessageCardScales.parts.contains(part) else { return }
                pinch = MessageCardPinch(part: part, factor: value, fromZone: false)
            }
            .onEnded { value in
                guard let current = pinch, !current.fromZone else { return }
                pinch = nil
                rescale(current.part, by: Double(value))
            }
    }

    /// L'échelle d'une partie, multipliée — bornée et aimantée par `MessageCardScales` ;
    /// la partie devient la partie désignée, et son onglet s'ouvre.
    func rescale(_ part: MessageCardPartID, by factor: Double) {
        let before = format.disposition.scales[part]
        format.disposition.scales[part] = before * factor
        if format.disposition.scales[part] != before { HapticFeedback.light() }
        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
            touched = true
            focus = part
            tab = MessageCardExportTab.of(part)
        }
    }

    /// Pendant le geste, la partie pincée — découpée dans l'aperçu — grandit ou
    /// rapetisse sous les doigts, bornée comme elle le sera ; le reste de la
    /// carte s'efface. Au lever des doigts, la carte se repeint à la vraie échelle.
    @ViewBuilder
    private func pinchPreview(_ pinch: MessageCardPinch, rendered: Rendered, scale: CGFloat) -> some View {
        if let region = rendered.regions.first(where: { $0.part == pinch.part }),
           let crop = rendered.image.cgImage?.cropping(to: CGRect(x: region.x, y: region.y, width: region.width, height: region.height)) {
            let current = format.disposition.scales[pinch.part]
            let target = min(MessageCardScales.range.upperBound, max(MessageCardScales.range.lowerBound, current * Double(pinch.factor)))
            ZStack(alignment: .topLeading) {
                Color.black.opacity(MeeshyOpacity.medium)
                Image(decorative: crop, scale: 1)
                    .resizable()
                    .frame(width: CGFloat(region.width) * scale, height: CGFloat(region.height) * scale)
                    .scaleEffect(CGFloat(target / current))
                    .shadow(color: .black.opacity(MeeshyOpacity.medium), radius: MeeshySpacing.md)
                    .offset(x: CGFloat(region.x) * scale, y: CGFloat(region.y) * scale)
                Text(target, format: .percent.precision(.fractionLength(0)))
                    .font(.caption.weight(.semibold))
                    .monospacedDigit()
                    .padding(.horizontal, MeeshySpacing.sm)
                    .padding(.vertical, MeeshySpacing.xs)
                    .adaptiveGlass(in: Capsule())
                    .offset(x: CGFloat(region.x) * scale + MeeshySpacing.xs, y: max(0, CGFloat(region.y) * scale - MeeshySpacing.xxl))
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }
}

/// Une partie qui se pince s'ajuste aussi au lecteur d'écran : balayer vers le
/// haut l'agrandit, vers le bas la réduit, et sa valeur dit son échelle.
private struct MessageCardScaleAccessibility: ViewModifier {
    let scalable: Bool
    let value: Double
    let adjust: (Double) -> Void

    func body(content: Content) -> some View {
        if scalable {
            content
                .accessibilityValue(Text(value, format: .percent.precision(.fractionLength(0))))
                .accessibilityHint(MessageCardExportText.text("export.card.scale.hint", "Balayez vers le haut ou le bas pour agrandir ou réduire"))
                .accessibilityAdjustableAction { direction in
                    switch direction {
                    case .increment: adjust(MessageCardExportSheet.scaleStep)
                    case .decrement: adjust(1 / MessageCardExportSheet.scaleStep)
                    @unknown default: break
                    }
                }
        } else {
            content
        }
    }
}
