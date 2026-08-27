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

    /// Libellé parlé d'un alignement — la rangée haute l'annonce à VoiceOver,
    /// qui n'a aucun équivalent du pictogramme.
    static func alignTitle(for align: String) -> String {
        switch align {
        case "left":  return String(localized: "story.textEdit.align.left", defaultValue: "Gauche", bundle: .module)
        case "right": return String(localized: "story.textEdit.align.right", defaultValue: "Droite", bundle: .module)
        default:      return String(localized: "story.textEdit.align.center", defaultValue: "Centré", bundle: .module)
        }
    }

    static func title(for shape: StoryTextFrameShape) -> String {
        switch shape {
        case .none:      return String(localized: "story.composer.noEffect", defaultValue: "Aucun", bundle: .module)
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

    /// Gabarit commun des pastilles de choix. Compressé de 48 à 38 pt
    /// (directive user 2026-07-26) pour qu'un maximum de valeurs tienne dans
    /// la largeur : les panneaux les plus fournis — 14 couleurs, 12 fonds —
    /// restent scrollables, décision assumée plutôt qu'un passage à la ligne.
    static let chipHeight: CGFloat = 38
    static let chipMinWidth: CGFloat = 46
    static let chipFontSize: CGFloat = 11

    var body: some View {
        // Rangée nue : pas de conteneur de panneau propre (fond arrondi,
        // contour). C'est `StoryTextEditToolbar` qui pose l'îlot de verre
        // autour de cette rangée — évite le panneau-dans-panneau et la
        // troncature verticale des pastilles.
        Group {
            switch tool {
            case .style:      styleOptions
            case .color:      colorOptions
            case .align:      alignOptions
            case .background: backgroundOptions
            case .frame:      frameOptions
            case .border:     borderOptions
            case .language:   languageOptions
            }
        }
        .frame(maxWidth: .infinity)
        .onAppear {
            var local = textObject
            if tool == .border { Self.initializeBorderDefaultsIfNeutral(on: &local) }
            if tool == .frame { Self.initializeFrameDefaultsIfNeutral(on: &local) }
            if local.borderColor != textObject.borderColor
                || local.borderWidth != textObject.borderWidth
                || local.frameBorderColor != textObject.frameBorderColor
                || local.frameBorderWidth != textObject.frameBorderWidth {
                textObject = local
            }
        }
    }

    // MARK: - Style

    /// La taille coiffe la liste des polices : c'est une valeur continue, elle
    /// se règle là où on choisit la famille plutôt que derrière une bulle.
    /// La graisse, elle, vit avec l'alignement (directive user 2026-07-28).
    private var styleOptions: some View {
        VStack(spacing: 10) {
            sizeSlider
            styleFamilyRow
        }
    }

    private var sizeSlider: some View {
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

    private var weightSlider: some View {
        HStack(spacing: 10) {
            Text("A")
                .font(.system(size: 13, weight: .thin))
                .foregroundStyle(.secondary)
            Slider(
                value: Binding(
                    get: { Self.weightSliderValue(for: textObject) },
                    set: { Self.applyingWeightSliderValue($0, to: &textObject) }
                ),
                in: 0...Double(StoryTextWeight.allCases.count - 1), step: 1
            )
            .tint(MeeshyColors.brandPrimary)
            Text("A")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(.secondary)
            Text(TextEditLabels.title(for: textObject.parsedFontWeight ?? .normal))
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.secondary)
                .frame(width: 52)
        }
    }

    private var styleFamilyRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(StoryTextStyle.allCases, id: \.self) { style in
                    let isSel = textObject.parsedTextStyle == style
                    Button {
                        textObject.textStyle = style.rawValue
                        HapticFeedback.light()
                    } label: {
                        Text("Aa")
                            .font(storyFont(for: style, size: 17))
                            .foregroundStyle(isSel ? Color.white : Color.primary)
                            .frame(width: Self.chipMinWidth, height: Self.chipHeight)
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

    /// Rang du curseur de graisse (0…3) pour l'état courant. `nil` se lit
    /// « normal » — la même valeur de repli que partout ailleurs — sinon le
    /// curseur démarrerait à « fin » et le premier drag épaissirait un texte
    /// que l'auteur n'a pas touché.
    nonisolated static func weightSliderValue(for text: StoryTextObject) -> Double {
        let weight = text.parsedFontWeight ?? .normal
        return Double(StoryTextWeight.allCases.firstIndex(of: weight) ?? 1)
    }

    /// Écrit la graisse correspondant à un rang de curseur, borné à la plage
    /// réelle de l'énuméré.
    nonisolated static func applyingWeightSliderValue(_ value: Double,
                                                      to text: inout StoryTextObject) {
        let steps = StoryTextWeight.allCases
        let index = min(steps.count - 1, max(0, Int(value.rounded())))
        text.fontWeight = steps[index].rawValue
    }

    // MARK: - Align

    /// Graisse et alignement partagent un panneau : ce sont les deux réglages
    /// qui décident de la SILHOUETTE du bloc de texte, indépendamment de la
    /// famille de police. Les loger ensemble évite d'ouvrir deux panneaux pour
    /// un même geste de mise en page.
    private var alignOptions: some View {
        VStack(spacing: 10) {
            weightSlider
            alignRow
        }
    }

    private var alignRow: some View {
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


    // MARK: - Langue du texte

    /// Langue dans laquelle ce texte est ÉCRIT — la base de toute traduction.
    ///
    /// Elle était devinée à partir de la langue de LECTURE de l'auteur, ce qui
    /// étiquetait `en` le texte français d'un francophone ayant réglé l'app en
    /// anglais. L'erreur est invisible à l'écriture et ne se paie qu'à la
    /// traduction, d'où ce choix explicite posé parmi les autres attributs.
    private var languageOptions: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Self.languageChoices(current: textObject.sourceLanguage), id: \.self) { code in
                    languageChip(code)
                }
            }
            .padding(.horizontal, 2)
        }
        .frame(height: 44)
    }

    /// Langues proposées : celles de l'interface Meeshy, la langue déjà posée
    /// sur le texte en tête si elle sort du lot — jamais de liste vide, et
    /// jamais de perte du choix courant.
    nonisolated static func languageChoices(current: String?) -> [String] {
        let base = ["fr", "en", "es", "de", "it", "pt", "ar"]
        guard let normalised = normalisedCode(current) else { return base }
        return base.contains(normalised) ? base : [normalised] + base
    }

    /// Réduit un code au format des pastilles (`pt-BR` → `pt`), ou `nil` s'il
    /// n'y a rien d'exploitable.
    nonisolated static func normalisedCode(_ raw: String?) -> String? {
        guard let raw else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        // Repli région/casse via le SSOT public `MeeshyUser.normalizeLanguageForDedup`
        // (même clé que les pastilles côté preview/story) — plus de boucle inline.
        return MeeshyUser.normalizeLanguageForDedup(trimmed)
    }

    private func languageChip(_ code: String) -> some View {
        let isSel = Self.normalisedCode(textObject.sourceLanguage) == code
        return Button {
            textObject.sourceLanguage = code
            HapticFeedback.light()
        } label: {
            Text(code.uppercased())
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(isSel ? Color.white : Color.primary)
                .frame(minWidth: 38)
                .frame(height: Self.chipHeight)
                .padding(.horizontal, 4)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(isSel ? AnyShapeStyle(MeeshyColors.brandGradient)
                                    : AnyShapeStyle(Color.gray.opacity(0.18)))
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Locale.current.localizedString(forLanguageCode: code) ?? code)
        .accessibilityAddTraits(isSel ? .isSelected : [])
    }

    // MARK: - Background

    private var backgroundOptions: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(Array(StoryTextBackgroundPresets.all.enumerated()), id: \.offset) { _, style in
                    backgroundChip(style)
                }
            }
        }
    }

    private func backgroundChip(_ style: StoryTextBackgroundStyle) -> some View {
        let isSel = textObject.resolvedBackgroundStyle == style
        return Button {
            textObject.backgroundStyle = style
            textObject.textBg = nil
            HapticFeedback.light()
        } label: {
            HStack(spacing: 6) {
                if case .solid(let hex) = style {
                    Circle()
                        .fill(Color(hex: hex))
                        .frame(width: 16, height: 16)
                        .overlay(Circle().stroke(.white.opacity(0.4), lineWidth: 0.5))
                }
                Text(StoryTextBackgroundPresets.label(for: style))
                    .font(.system(size: Self.chipFontSize, weight: .semibold))
            }
            .foregroundStyle(isSel ? Color.white : Color.primary)
            .padding(.horizontal, 9)
            .frame(height: Self.chipHeight)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(isSel ? AnyShapeStyle(MeeshyColors.brandGradient)
                                : AnyShapeStyle(Color.gray.opacity(0.18)))
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Frame (cadrage)

    /// Forme, marge et liseré de la boîte de cadre. La forme est indépendante
    /// du fond depuis que `hasFrameBox` existe : choisir un cadre ne repeint
    /// plus le texte d'un fond noir non demandé.
    private var frameOptions: some View {
        VStack(spacing: 10) {
            frameShapeRow
            framePaddingSlider
            frameBorderSlider
            frameBorderPalette
        }
    }

    private var frameShapeRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(StoryTextFrameShape.allCases, id: \.self) { shape in
                    let isSel = textObject.parsedFrameShape == shape
                    Button {
                        var local = textObject
                        local.frameShape = shape.rawValue
                        Self.initializeFrameDefaultsIfNeutral(on: &local)
                        textObject = local
                        HapticFeedback.light()
                    } label: {
                        Text(TextEditLabels.title(for: shape))
                            .font(.system(size: Self.chipFontSize, weight: .semibold))
                            .foregroundStyle(isSel ? Color.white : Color.primary)
                            .padding(.horizontal, 10)
                            .frame(height: Self.chipHeight)
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

    /// Marge exprimée en MULTIPLICATEUR : la marge automatique vaut « au moins
    /// la chasse d'un *o* », elle dépend donc de la police et de la taille.
    /// Un réglage en points deviendrait faux au premier changement de l'une
    /// des deux.
    private var framePaddingSlider: some View {
        HStack(spacing: 10) {
            Image(systemName: "rectangle.compress.vertical")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
            Slider(
                value: Binding(
                    get: { textObject.resolvedFramePaddingScale },
                    set: { textObject.framePaddingScale = $0 }
                ),
                in: 0...3, step: 0.1
            )
            .tint(MeeshyColors.brandPrimary)
            Image(systemName: "rectangle.expand.vertical")
                .font(.system(size: 14))
                .foregroundStyle(.secondary)
            Text("×\(String(format: "%.1f", textObject.resolvedFramePaddingScale))")
                .font(.system(size: 12, weight: .bold, design: .monospaced))
                .foregroundStyle(.secondary)
                .frame(width: 40)
        }
    }

    /// Liseré à 0 ⇒ aucun trait rendu. La couleur est conservée pour qu'on
    /// puisse remonter le curseur sans avoir à la re-choisir — même règle que
    /// le contour de glyphes.
    private var frameBorderSlider: some View {
        HStack(spacing: 10) {
            Image(systemName: "square.dashed")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
            Slider(
                value: Binding(
                    get: { textObject.frameBorderWidth ?? 0 },
                    set: { newValue in
                        textObject.frameBorderWidth = newValue
                        if textObject.frameBorderColor == nil {
                            textObject.frameBorderColor = StoryTextAttributeCycle.defaultFrameBorderColor
                        }
                    }
                ),
                in: 0...12, step: 0.5
            )
            .tint(MeeshyColors.brandPrimary)
            Image(systemName: "square")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(.secondary)
            Text(String(format: "%.1f", textObject.frameBorderWidth ?? 0))
                .font(.system(size: 12, weight: .bold, design: .monospaced))
                .foregroundStyle(.secondary)
                .frame(width: 34)
        }
    }

    private var frameBorderPalette: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(StoryTextColors.palette, id: \.self) { hex in
                    let isSel = textObject.frameBorderColor?.caseInsensitiveCompare(hex) == .orderedSame
                    Button {
                        textObject.frameBorderColor = hex
                        if (textObject.frameBorderWidth ?? 0) == 0 {
                            textObject.frameBorderWidth = StoryTextAttributeCycle.defaultFrameBorderWidth
                        }
                        HapticFeedback.light()
                    } label: {
                        colorDot(hex: hex, selected: isSel, size: 28)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(4)
        }
    }

    /// Corner radius of the chip itself, previewing the shape it selects.
    /// Les formes path-based (losange / nuage / bulle BD) gardent un chip
    /// arrondi standard — leur libellé porte l'information.
    private func frameChipRadius(_ shape: StoryTextFrameShape) -> CGFloat {
        switch shape {
        case .none, .rounded, .diamond, .cloud, .speech: return 10
        case .pill:      return 19
        case .rectangle: return 2
        }
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

    /// Pose un liseré discret quand le panneau Cadre s'ouvre sur un texte qui
    /// n'a rien à montrer — ni fond, ni liseré. Sans ça, les sept formes se
    /// choisissent sans qu'aucune ne se voie.
    ///
    /// Ne touche pas un texte qui a déjà un fond (la forme y est visible), ni
    /// un texte dont l'auteur a explicitement choisi « Aucun ».
    static func initializeFrameDefaultsIfNeutral(on obj: inout StoryTextObject) {
        guard obj.parsedFrameShape != StoryTextFrameShape.none,
              obj.resolvedBackgroundStyle == StoryTextBackgroundStyle.none,
              (obj.frameBorderWidth ?? 0) == 0 else { return }
        obj.frameBorderWidth = StoryTextAttributeCycle.defaultFrameBorderWidth
        obj.frameBorderColor = StoryTextAttributeCycle.defaultFrameBorderColor
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

