import SwiftUI
import MeeshySDK

/// Panneau d'options préréglées affiché sous le texte quand une bulle d'outil
/// est dépliée. Chaque option écrit directement dans le `StoryTextObject` via
/// le binding — le canvas et le champ d'édition se mettent à jour live.
/// V1 : presets uniquement (pas de picker système ni de slider continu libre).
/// Localized titles for `StoryTextWeight`/`StoryTextFrameShape` — lives here
/// (MeeshyUI) and not on the enums themselves (MeeshySDK core, no resource
/// bundle). Same pattern as `OpeningEffectChips.title(for:)`.
enum TextEditLabels {
    static func title(for weight: StoryTextWeight) -> String {
        switch weight {
        case .thin:     return String(localized: "story.textEdit.weight.thin", defaultValue: "Fin", bundle: .module)
        case .normal:   return String(localized: "story.textEdit.weight.normal", defaultValue: "Normal", bundle: .module)
        case .semibold: return String(localized: "story.textEdit.weight.semibold", defaultValue: "Semi", bundle: .module)
        case .bold:     return String(localized: "story.textEdit.weight.bold", defaultValue: "Gras", bundle: .module)
        }
    }

    static func title(for shape: StoryTextFrameShape) -> String {
        switch shape {
        case .rounded:   return String(localized: "story.textEdit.frame.rounded", defaultValue: "Arrondi", bundle: .module)
        case .pill:      return String(localized: "story.textEdit.frame.pill", defaultValue: "Pilule", bundle: .module)
        case .rectangle: return String(localized: "story.textEdit.frame.rectangle", defaultValue: "Carré", bundle: .module)
        case .diamond:   return String(localized: "story.textEdit.frame.diamond", defaultValue: "Losange", bundle: .module)
        case .cloud:     return String(localized: "story.textEdit.frame.cloud", defaultValue: "Nuage", bundle: .module)
        case .speech:    return String(localized: "story.textEdit.frame.speech", defaultValue: "Bulle BD", bundle: .module)
        }
    }
}

struct TextEditToolOptions: View {
    let tool: TextEditTool
    @Binding var textObject: StoryTextObject

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        // Rangée nue : pas de conteneur de panneau propre (fond arrondi,
        // contour). C'est `StoryTextEditToolbar` qui pose l'îlot de verre
        // autour de cette rangée — évite le panneau-dans-panneau et la
        // troncature verticale des pastilles.
        Group {
            switch tool {
            case .style:      styleOptions
            case .weight:     weightOptions
            case .color:      colorOptions
            case .size:       sizeOptions
            case .align:      alignOptions
            case .background: backgroundOptions
            case .frame:      frameOptions
            case .border:     borderOptions
            }
        }
        .frame(maxWidth: .infinity)
        .onAppear {
            if tool == .border {
                var local = textObject
                Self.initializeBorderDefaultsIfNeutral(on: &local)
                if local.borderColor != textObject.borderColor || local.borderWidth != textObject.borderWidth {
                    textObject = local
                }
            }
        }
    }

    // MARK: - Style

    private var styleOptions: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(StoryTextStyle.allCases, id: \.self) { style in
                    let isSel = textObject.parsedTextStyle == style
                    Button {
                        textObject.textStyle = style.rawValue
                        HapticFeedback.light()
                    } label: {
                        Text("Aa")
                            .font(storyFont(for: style, size: 18))
                            .foregroundStyle(isSel ? Color.white : Color.primary)
                            .frame(width: 54, height: 42)
                            .background(
                                RoundedRectangle(cornerRadius: 10)
                                    .fill(isSel ? AnyShapeStyle(MeeshyColors.brandGradient)
                                                : AnyShapeStyle(Color.gray.opacity(0.18)))
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - Weight

    /// Graisse indépendante : fin / normal / semi-gras / gras. Écrit
    /// `fontWeight` (override) sur le `StoryTextObject`.
    private var weightOptions: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(StoryTextWeight.allCases, id: \.self) { weight in
                    let isSel = textObject.parsedFontWeight == weight
                    Button {
                        textObject.fontWeight = weight.rawValue
                        HapticFeedback.light()
                    } label: {
                        Text(TextEditLabels.title(for: weight))
                            .font(.system(size: 14, weight: weight.swiftUIWeight))
                            .foregroundStyle(isSel ? Color.white : Color.primary)
                            .frame(minWidth: 54)
                            .padding(.horizontal, 6)
                            .frame(height: 42)
                            .background(
                                RoundedRectangle(cornerRadius: 10)
                                    .fill(isSel ? AnyShapeStyle(MeeshyColors.brandGradient)
                                                : AnyShapeStyle(Color.gray.opacity(0.18)))
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 2)
        }
    }

    // MARK: - Color

    private var colorOptions: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(StoryTextColors.palette, id: \.self) { hex in
                    let isSel = (textObject.textColor ?? "FFFFFF") == hex
                    Button {
                        textObject.textColor = hex
                        HapticFeedback.light()
                    } label: {
                        colorDot(hex: hex, selected: isSel, size: 32)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(4)   // marge pour le `scaleEffect` des pastilles sélectionnées
        }
    }

    // MARK: - Size

    private var sizeOptions: some View {
        HStack(spacing: 10) {
            Image(systemName: "textformat.size.smaller")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
            Slider(
                value: Binding(
                    get: { Self.displayedSize(for: textObject) },
                    set: { Self.applyingSliderValue($0, to: &textObject) }
                ),
                in: 14...160, step: 1
            )
            .tint(MeeshyColors.brandPrimary)
            Image(systemName: "textformat.size.larger")
                .font(.system(size: 16))
                .foregroundStyle(.secondary)
            Text("\(Int(Self.displayedSize(for: textObject)))")
                .font(.system(size: 12, weight: .bold, design: .monospaced))
                .foregroundStyle(.secondary)
                .frame(width: 34)
        }
    }

    /// The value the size slider displays: the object's effective rendered
    /// size (`fontSize × scale`, cf. `StoryTextLayer.configure`). The canvas
    /// pinch gesture live-mutates `scale` on every `.changed` tick
    /// (`StoryCanvasUIView+Gestures.handlePinch` → `onItemModified` →
    /// `viewModel.currentSlide`), so reading the product here makes the
    /// slider track a pinch live with no extra plumbing.
    nonisolated static func displayedSize(for text: StoryTextObject) -> Double {
        text.fontSize * text.scale
    }

    /// Applies a slider drag: writes the new value into `fontSize` and
    /// resets `scale` to 1 so a leftover pinch scale never compounds with a
    /// later manual resize.
    nonisolated static func applyingSliderValue(_ value: Double, to text: inout StoryTextObject) {
        text.fontSize = value
        text.scale = 1
    }

    // MARK: - Align

    private var alignOptions: some View {
        HStack(spacing: 10) {
            alignButton("left", "text.alignleft")
            alignButton("center", "text.aligncenter")
            alignButton("right", "text.alignright")
        }
    }

    private func alignButton(_ value: String, _ symbol: String) -> some View {
        let isSel = (textObject.textAlign ?? "center") == value
        return Button {
            textObject.textAlign = value
            HapticFeedback.light()
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(isSel ? Color.white : Color.primary)
                .frame(maxWidth: .infinity)
                .frame(height: 38)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(isSel ? AnyShapeStyle(MeeshyColors.brandGradient)
                                    : AnyShapeStyle(Color.gray.opacity(0.18)))
                )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Background

    private var backgroundOptions: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                bgChip(label: String(localized: "story.composer.noEffect", defaultValue: "Aucun", bundle: .module), isSel: isBgNone) {
                    textObject.backgroundStyle = StoryTextBackgroundStyle.none
                    textObject.textBg = nil
                }
                bgChip(label: String(localized: "story.textEdit.bg.glass", defaultValue: "Verre", bundle: .module), isSel: isBgGlass) {
                    textObject.backgroundStyle = .glass(radius: 24)
                    textObject.textBg = nil
                }
                bgSolidChip(hex: "000000", label: String(localized: "story.textEdit.bg.black", defaultValue: "Noir", bundle: .module))
                bgSolidChip(hex: "000000A6", label: String(localized: "story.textEdit.bg.black65", defaultValue: "Noir 65%", bundle: .module))
                bgSolidChip(hex: "FFFFFF", label: String(localized: "story.textEdit.bg.white", defaultValue: "Blanc", bundle: .module))
                bgSolidChip(hex: "FFFFFFA6", label: String(localized: "story.textEdit.bg.white65", defaultValue: "Blanc 65%", bundle: .module))
                bgSolidChip(hex: "6366F1", label: String(localized: "story.textEdit.bg.indigo", defaultValue: "Indigo", bundle: .module))
                bgSolidChip(hex: "6366F1A6", label: String(localized: "story.textEdit.bg.indigo65", defaultValue: "Indigo 65%", bundle: .module))
                bgSolidChip(hex: "F472B6", label: String(localized: "story.textEdit.bg.pink", defaultValue: "Rose", bundle: .module))
                bgSolidChip(hex: "34D399", label: String(localized: "story.textEdit.bg.green", defaultValue: "Vert", bundle: .module))
                bgSolidChip(hex: "FBBF24", label: String(localized: "story.textEdit.bg.amber", defaultValue: "Ambre", bundle: .module))
                bgSolidChip(hex: "F87171", label: String(localized: "story.textEdit.bg.red", defaultValue: "Rouge", bundle: .module))
            }
        }
    }

    // MARK: - Frame (cadrage)

    /// Forme de la boîte de cadrage derrière le texte (actif uniquement quand un
    /// fond est présent). Le padding ≥ 1 'o' est automatique côté rendu.
    private var frameOptions: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(StoryTextFrameShape.allCases, id: \.self) { shape in
                    let isSel = textObject.parsedFrameShape == shape
                    Button {
                        textObject.frameShape = shape.rawValue
                        // Un cadrage n'a de sens qu'avec un fond : si aucun fond
                        // n'est actif, on en pose un (verre discret) pour rendre
                        // le choix visible immédiatement.
                        if case .none = textObject.resolvedBackgroundStyle {
                            textObject.backgroundStyle = .solid(hex: "000000A6")
                            textObject.textBg = nil
                        }
                        HapticFeedback.light()
                    } label: {
                        Text(TextEditLabels.title(for: shape))
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(isSel ? Color.white : Color.primary)
                            .padding(.horizontal, 14)
                            .frame(height: 38)
                            .background(
                                RoundedRectangle(cornerRadius: frameChipRadius(shape))
                                    .fill(isSel ? AnyShapeStyle(MeeshyColors.brandGradient)
                                                : AnyShapeStyle(Color.gray.opacity(0.18)))
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 2)
        }
    }

    /// Corner radius of the chip itself, previewing the shape it selects.
    /// Les formes path-based (losange / nuage / bulle BD) gardent un chip
    /// arrondi standard — leur libellé porte l'information.
    private func frameChipRadius(_ shape: StoryTextFrameShape) -> CGFloat {
        switch shape {
        case .rounded, .diamond, .cloud, .speech: return 10
        case .pill:      return 19
        case .rectangle: return 2
        }
    }

    private var isBgNone: Bool {
        if case .none = textObject.resolvedBackgroundStyle { return true }
        return false
    }
    private var isBgGlass: Bool {
        if case .glass = textObject.resolvedBackgroundStyle { return true }
        return false
    }
    private func isBgSolid(_ hex: String) -> Bool {
        if case .solid(let h) = textObject.resolvedBackgroundStyle {
            return h.caseInsensitiveCompare(hex) == .orderedSame
        }
        return false
    }

    private func bgChip(label: String, isSel: Bool, action: @escaping () -> Void) -> some View {
        Button {
            action()
            HapticFeedback.light()
        } label: {
            Text(label)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(isSel ? Color.white : Color.primary)
                .padding(.horizontal, 14)
                .frame(height: 38)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(isSel ? AnyShapeStyle(MeeshyColors.brandGradient)
                                    : AnyShapeStyle(Color.gray.opacity(0.18)))
                )
        }
        .buttonStyle(.plain)
    }

    private func bgSolidChip(hex: String, label: String) -> some View {
        let isSel = isBgSolid(hex)
        return Button {
            textObject.backgroundStyle = .solid(hex: hex)
            textObject.textBg = nil
            HapticFeedback.light()
        } label: {
            HStack(spacing: 6) {
                Circle()
                    .fill(Color(hex: hex))
                    .frame(width: 16, height: 16)
                    .overlay(Circle().stroke(.white.opacity(0.4), lineWidth: 0.5))
                Text(label).font(.system(size: 12, weight: .semibold))
            }
            .foregroundStyle(isSel ? Color.white : Color.primary)
            .padding(.horizontal, 12)
            .frame(height: 38)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(isSel ? AnyShapeStyle(MeeshyColors.brandGradient)
                                : AnyShapeStyle(Color.gray.opacity(0.18)))
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Border

    /// Initialise les défauts de bordure si l'utilisateur n'en a jamais défini.
    /// Posé à l'ouverture du tool border par le parent (`StoryTextEditToolbar`)
    /// pour offrir un retour visuel immédiat : trait blanc 4pt sur le texte.
    static func initializeBorderDefaultsIfNeutral(on obj: inout StoryTextObject) {
        if obj.borderColor == nil && obj.borderWidth == nil {
            obj.borderColor = "FFFFFF"
            obj.borderWidth = 4
        }
    }

    private var borderOptions: some View {
        VStack(spacing: 10) {
            // Slider continu 0...12pt, défaut 4pt (cf. `initializeBorderDefaultsIfNeutral`).
            // Slider à 0 ⇒ aucun trait rendu (guard `widthPx > 0` dans `StoryTextLayer`).
            // Couleur conservée → utilisateur peut remonter le slider sans re-choisir une couleur.
            HStack(spacing: 10) {
                Image(systemName: "textformat.size.smaller")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                Slider(
                    value: Binding(
                        get: { textObject.borderWidth ?? 0 },
                        set: { newValue in
                            textObject.borderWidth = newValue
                            if textObject.borderColor == nil { textObject.borderColor = "FFFFFF" }
                        }
                    ),
                    in: 0...12,
                    step: 0.5
                )
                .tint(MeeshyColors.brandPrimary)
                Image(systemName: "bold")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.secondary)
                Text(String(format: "%.1f", textObject.borderWidth ?? 0))
                    .font(.system(size: 12, weight: .bold, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .frame(width: 34)
            }
            // Palette de couleurs — TOUJOURS active (suppression `.disabled` + `.opacity`).
            // Tap sur une couleur quand `borderWidth == 0` re-active 4pt automatiquement.
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(StoryTextColors.palette, id: \.self) { hex in
                        let isSel = textObject.borderColor?.caseInsensitiveCompare(hex) == .orderedSame
                        Button {
                            textObject.borderColor = hex
                            if textObject.borderWidth == nil || textObject.borderWidth == 0 {
                                textObject.borderWidth = 4
                            }
                            HapticFeedback.light()
                        } label: {
                            colorDot(hex: hex, selected: isSel, size: 28)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(4)   // marge pour le `scaleEffect` des pastilles sélectionnées
            }
        }
    }

    // MARK: - Shared

    private func colorDot(hex: String, selected: Bool, size: CGFloat) -> some View {
        // L'agrandissement `scaleEffect` de la sélection est conservé ; les
        // `ScrollView` de pastilles ont une marge interne (`.padding(4)`) pour
        // que ce débordement ne soit pas rogné.
        Circle()
            .fill(Color(hex: hex))
            .frame(width: size, height: size)
            .overlay(Circle().stroke(Color.white, lineWidth: selected ? 3 : 0).padding(1))
            .overlay(Circle().stroke(Color.black.opacity(0.15), lineWidth: 0.5))
            .scaleEffect(selected ? 1.1 : 1.0)
            .animation(.spring(response: 0.2), value: selected)
    }
}

private extension StoryTextWeight {
    /// SwiftUI weight used to preview the chip label in its own graisse.
    var swiftUIWeight: Font.Weight {
        switch self {
        case .thin: return .thin
        case .normal: return .regular
        case .semibold: return .semibold
        case .bold: return .bold
        }
    }
}
