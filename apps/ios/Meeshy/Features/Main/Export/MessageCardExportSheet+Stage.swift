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
            value: min(format.disposition.scales[region.part], scaleLimit(of: region.part)),
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

    /// La borne d'une partie sur CETTE carte : les médias s'arrêtent où le
    /// texte garderait moins que sa place minimale (revue #8979).
    func scaleLimit(of part: MessageCardPartID) -> Double {
        part == .media ? (rendered?.mediaScaleLimit ?? MessageCardScales.range.upperBound) : MessageCardScales.range.upperBound
    }

    /// L'échelle d'une partie, multipliée — bornée par la carte et aimantée par
    /// `MessageCardScales` ; la partie devient la partie désignée, et son onglet s'ouvre.
    func rescale(_ part: MessageCardPartID, by factor: Double) {
        let before = format.disposition.scales[part]
        format.disposition.scales[part] = format.disposition.scales.pinched(part, by: factor, limit: scaleLimit(of: part))
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
            let limit = scaleLimit(of: pinch.part)
            let current = min(format.disposition.scales[pinch.part], limit)
            let target = format.disposition.scales.pinched(pinch.part, by: Double(pinch.factor), limit: limit)
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

// MARK: - Les compositions d'un commentaire de post (#9686)

extension MessageCardExportSheet {

    /// Au-dessus de l'aperçu : les modes, « Post en tête », et les cases du fil
    /// sous « Choisir les réponses ». Rien quand il n'y a rien à choisir.
    @ViewBuilder
    var compositionBar: some View {
        if let composition = request.composition, composition.offersChoice {
            MessageCardCompositionBar(
                composition: composition,
                mode: $compositionMode,
                showsPost: $showsPost,
                chosen: $chosenReplies
            )
        }
    }
}

/// Les puces de composition — un toucher change la carte, l'aperçu se repeint aussitôt.
struct MessageCardCompositionBar: View {
    let composition: MessageCardCommentComposition
    @Binding var mode: PostCommentCardMode?
    @Binding var showsPost: Bool
    @Binding var chosen: Set<String>

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: MeeshySpacing.sm) {
                    if composition.modes.count > 1 {
                        ForEach(composition.modes, id: \.self) { item in
                            chip(MessageCardCommentComposition.label(of: item), systemImage: nil, selected: mode == item) {
                                select(item)
                            }
                        }
                    }
                    if composition.offersPostToggle {
                        chip(MessageCardCommentComposition.postToggleLabel, systemImage: showsPost ? "checkmark" : "plus", selected: showsPost) {
                            showsPost.toggle()
                        }
                    }
                }
            }
            if mode == .chosenReplies {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: MeeshySpacing.sm) {
                        ForEach(composition.choosable) { comment in
                            let selected = chosen.contains(comment.id)
                            chip("\(comment.author) · \(Self.excerpt(composition.source.read(comment.displayContent)))",
                                 systemImage: selected ? "checkmark.circle.fill" : "circle", selected: selected) {
                                if selected { chosen.remove(comment.id) } else { chosen.insert(comment.id) }
                            }
                        }
                    }
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: mode)
    }

    private func select(_ next: PostCommentCardMode) {
        guard mode != next else { return }
        mode = next
        showsPost = next.showsPostByDefault
        if next == .chosenReplies { chosen = composition.initialChoice }
    }

    private func chip(_ title: String, systemImage: String?, selected: Bool, action: @escaping () -> Void) -> some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            HStack(spacing: MeeshySpacing.xs) {
                if let systemImage { Image(systemName: systemImage).accessibilityHidden(true) }
                Text(title).lineLimit(1)
            }
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .frame(minHeight: 44)
            .foregroundStyle(Color(uiColor: Self.ink(selected: selected)))
            .background(Capsule().fill(Color(uiColor: Self.fill(selected: selected))))
        }
        .buttonStyle(MessageCardPressStyle())
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    /// L'encre et le fond d'une puce — ceux des pastilles du plateau (`pill`) :
    /// sélectionnée, l'encre du fond système sur l'encre du texte, opaque ; sinon
    /// le texte sur un voile à 7 %. Le contraste tient en clair ET en sombre.
    static func ink(selected: Bool) -> UIColor {
        selected ? .systemBackground : .label
    }

    static func fill(selected: Bool) -> UIColor {
        selected ? .label : UIColor.label.withAlphaComponent(0.07)
    }

    private static func excerpt(_ text: String) -> String {
        let flat = text.replacingOccurrences(of: "\n", with: " ").trimmingCharacters(in: .whitespacesAndNewlines)
        return flat.count > 24 ? String(flat.prefix(24)) + "…" : flat
    }
}
