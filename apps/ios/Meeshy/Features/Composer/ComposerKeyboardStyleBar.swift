import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Les sept commandes de la barre collée au clavier** (#18781, recette
/// porteur sur iPhone, après #13839 L4 et #18640).
///
/// > « Il faut enlever l'alignement et mettre Effet sur le texte ET langue,
/// > ainsi que le contour cercle […] avant d'avoir les cadres et le style de
/// > cadre. »
///
/// `Aa · Effet · Langue · ● · ◯ · Cadre · Style du cadre`. L'alignement quitte
/// la barre sans quitter l'outil : il vit dans le panneau Aa. Chaque contrôle
/// des huit `TextEditTool` paraît dans exactement un panneau
/// (`ComposerKeyboardStyleBarTests`). L'énuméré du SDK n'est pas réordonné :
/// l'ordre de ses `case` porte sa sérialisation.
nonisolated enum ComposerKeyboardStyleFamily: String, CaseIterable, Equatable, Sendable {
    /// Aa — police, taille, graisse, et l'alignement dans son panneau.
    case typography
    case effect
    case language
    /// ● — la couleur du texte, cercle plein de cette couleur.
    case color
    /// ◯ — le contour, cercle creux de la couleur du contour.
    case outline
    /// La forme du cadre et ses marges.
    case frame
    /// Le fond, puis l'épaisseur et la couleur du liseré du cadre.
    case frameStyle

    var tools: [TextEditTool] {
        switch self {
        case .typography: return [.style, .align]
        case .effect:     return [.effect]
        case .language:   return [.language]
        case .color:      return [.color]
        case .outline:    return [.border]
        case .frame:      return [.frame]
        case .frameStyle: return [.background, .frame]
        }
    }

    /// Ce que le panneau de la commande peint, de haut en bas. Chaque panneau
    /// n'a qu'une palette.
    var panel: [ComposerKeyboardPanelSection] {
        switch self {
        case .typography:
            return [.tool(.style, omitting: []), .tool(.align, omitting: [.alignment]),
                    .tool(.align, omitting: [.weight])]
        case .effect:
            return [.tool(.effect, omitting: [])]
        case .language:
            return [.tool(.language, omitting: [])]
        case .color:
            return [.palette([.text])]
        case .outline:
            return [.tool(.border, omitting: [.borderPalette]), .palette([.border])]
        case .frame:
            return [.tool(.frame, omitting: [.frameBorderWidth, .frameBorderPalette]), .palette([.frame])]
        case .frameStyle:
            return [.tool(.background, omitting: []),
                    .tool(.frame, omitting: [.frameShapes, .framePadding, .frameBorderPalette])]
        }
    }

    /// L'outil que le toucher fait tourner (#18640) : le premier de la commande.
    var quickTool: TextEditTool {
        tools[0]
    }

    /// Le panneau, moins les outils que l'hôte ne sert pas (un texte cuit n'a pas de « Langue »).
    func panel(serving tools: [TextEditTool]) -> [ComposerKeyboardPanelSection] {
        panel.filter { section in
            if case .tool(let outil, _) = section { return tools.contains(outil) }
            return true
        }
    }

    /// Les commandes que l'hôte sert : une commande sans rangée servie n'a pas de bouton.
    static func served(by tools: [TextEditTool]) -> [ComposerKeyboardStyleFamily] {
        allCases.filter { tools.contains($0.quickTool) && !$0.panel(serving: tools).isEmpty }
    }

    /// **Ce que la commande montre : la restitution de ce qu'elle règle** — Aa
    /// dans la police, Aa avec l'effet, le code de la langue, le cercle plein de
    /// la couleur du texte, le cercle creux de la couleur du contour, la forme du
    /// cadre teintée de son liseré, le fond. La table est celle du SDK
    /// (`StoryTextAttributeCycle.indicator`) ; seul le contour se dessine en
    /// cercle, à côté du cercle plein.
    func indicator(of text: StoryTextObject) -> StoryTextAttributeCycle.Indicator {
        switch self {
        case .outline:
            let teinte = (text.borderWidth ?? 0) > 0 ? (text.borderColor ?? "FFFFFF") : nil
            return .symbol(name: "circle", emphasis: 0, tint: teinte)
        case .typography, .effect, .language, .color, .frame, .frameStyle:
            return StoryTextAttributeCycle.indicator(quickTool, of: text)
        }
    }

    /// **Le toucher d'une commande** (#18640). Le contour fait exception : le
    /// toucher pose 1 pt et parcourt les couleurs, puis retire le contour après
    /// la dernière ; sa taille se règle à l'appui long.
    static func quickAdvance(_ tool: TextEditTool, on text: inout StoryTextObject,
                             backgrounds: [StoryTextBackgroundStyle]) {
        guard tool == .border else {
            StoryTextAttributeCycle.advance(tool, on: &text, backgrounds: backgrounds)
            return
        }
        let couleurs = TextEditPalette.colors
        guard (text.borderWidth ?? 0) > 0 else {
            text.borderWidth = 1
            text.borderColor = couleurs.first
            return
        }
        let courante = text.borderColor ?? ""
        switch couleurs.firstIndex(where: { $0.caseInsensitiveCompare(courante) == .orderedSame }) {
        case nil:
            text.borderColor = couleurs.first
        case let index? where index + 1 < couleurs.count:
            text.borderColor = couleurs[index + 1]
        default:
            text.borderWidth = 0
        }
    }

    var symbol: String {
        switch self {
        case .typography: return "textformat"
        case .effect:     return "sparkles"
        case .language:   return "globe"
        case .color:      return "circle.fill"
        case .outline:    return "circle"
        case .frame:      return "rectangle.dashed"
        case .frameStyle: return "rectangle.inset.filled"
        }
    }

    @MainActor
    var label: String {
        switch self {
        case .typography:
            return String(localized: "composer.keyboard.family.font",
                          defaultValue: "Police", bundle: .main)
        case .effect:     return TextEditTool.effect.accessibilityLabel
        case .language:   return TextEditTool.language.accessibilityLabel
        case .color:      return TextEditTool.color.accessibilityLabel
        case .outline:    return TextEditTool.border.accessibilityLabel
        case .frame:
            return String(localized: "composer.keyboard.family.frame",
                          defaultValue: "Cadre", bundle: .main)
        case .frameStyle:
            return String(localized: "composer.keyboard.family.frameStyle",
                          defaultValue: "Style du cadre", bundle: .main)
        }
    }
}

/// Une rangée d'un panneau : un outil du SDK moins ce qu'un autre panneau
/// peint, ou la palette unique et ses cibles.
nonisolated enum ComposerKeyboardPanelSection: Equatable, Sendable {
    case tool(TextEditTool, omitting: Set<TextEditOptionPart>)
    case palette([TextEditPaletteTarget])

    var parts: [TextEditOptionPart] {
        switch self {
        case .tool(let outil, let omis): return TextEditToolOptions.parts(for: outil, omitting: omis)
        case .palette(let cibles):       return cibles.map(\.part)
        }
    }

    /// Le titre posé au-dessus de la rangée.
    @MainActor
    var title: String {
        switch self {
        case .tool(.align, let omis) where omis.contains(.alignment):
            return ComposerKeyboardStyleCopy.weight
        case .tool(.frame, let omis) where omis.contains(.frameShapes):
            return ComposerKeyboardStyleCopy.frameBorderWidth
        case .tool(let outil, _):
            return outil.accessibilityLabel
        case .palette(let cibles) where cibles == [.frame]:
            return ComposerKeyboardStyleCopy.frameColor
        case .palette(let cibles) where cibles == [.border]:
            return ComposerKeyboardStyleCopy.outlineColor
        case .palette:
            return TextEditTool.color.accessibilityLabel
        }
    }
}

nonisolated enum ComposerKeyboardStyleBar {
    /// Une cible de 44 pt : la barre ne grandit pas avec Dynamic Type — ses
    /// glyphes se lisent par VoiceOver.
    static let height: CGFloat = 44
    /// L'appui qui ouvre toutes les options d'une commande.
    static let optionsPress: Double = 0.4
}

nonisolated enum ComposerKeyboardStyleCopy {
    @MainActor
    static var done: String {
        String(localized: "composer.keyboard.done", defaultValue: "OK", bundle: .main)
    }

    @MainActor
    static var doneHint: String {
        String(localized: "composer.keyboard.done.hint",
               defaultValue: "Termine l'écriture et rend la scène", bundle: .main)
    }

    @MainActor
    static var allOptions: String {
        String(localized: "composer.keyboard.allOptions", defaultValue: "Toutes les options", bundle: .main)
    }

    /// La palette du ▣ colore le liseré du cadre : sous les formes du cadre,
    /// un second « Cadre » ne dirait pas ce qu'elle règle.
    @MainActor
    static var frameColor: String {
        String(localized: "composer.keyboard.frameColor", defaultValue: "Couleur du cadre", bundle: .main)
    }

    @MainActor
    static var outlineColor: String {
        String(localized: "composer.keyboard.outlineColor", defaultValue: "Couleur du contour", bundle: .main)
    }

    @MainActor
    static var frameBorderWidth: String {
        String(localized: "composer.keyboard.frameBorderWidth", defaultValue: "Épaisseur du liseré", bundle: .main)
    }

    @MainActor
    static var weight: String {
        String(localized: "composer.keyboard.weight", defaultValue: "Graisse", bundle: .main)
    }
}

extension ComposerLanguageFlag {
    /// **« Langue : FR »** — la légende et le corps du post disent en mots dans
    /// quelle langue on écrit ; un drapeau seul ne dit pas ce qu'il règle.
    @MainActor
    static func writingLabel(for code: String) -> String {
        let base = MeeshyUser.normalizeLanguageCode(code) ?? code.lowercased()
        let court = base.split(separator: "-").first.map(String.init) ?? base
        return String(format: String(localized: "composer.writing.language",
                                     defaultValue: "Langue : %@", bundle: .main),
                      court.uppercased())
    }
}

// MARK: - La barre

/// **Aa · Effet · Langue · ● · ◯ · Cadre · Style du cadre · OK**, collée au
/// clavier du champ en place (#18781). Les commandes défilent si l'écran est
/// trop étroit ; OK reste toujours visible.
struct ComposerKeyboardStyleBarView: View {
    var families: [ComposerKeyboardStyleFamily] = ComposerKeyboardStyleFamily.allCases
    /// Le texte en cours : le cercle plein et le cercle creux en montrent les couleurs.
    var text: StoryTextObject?
    let openFamily: ComposerKeyboardStyleFamily?
    /// Toucher : la valeur suivante. Appui long : toutes les options (#18640).
    let onFamily: (ComposerKeyboardStyleFamily, ComposerKeyboardOrOptions.Gesture) -> Void
    let onDone: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 0) {
                    ForEach(families, id: \.self) { famille in
                        familyButton(famille)
                    }
                }
            }
            Spacer(minLength: MeeshySpacing.xs)
            Button(action: onDone) {
                Text(ComposerKeyboardStyleCopy.done)
                    .font(MeeshyFont.relative(MeeshyFont.calloutSize, weight: .bold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .foregroundStyle(.white)
                    .padding(.horizontal, MeeshySpacing.md)
                    .frame(height: 32)
                    .background(Capsule().fill(MeeshyColors.brandPrimary))
                    .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint(Text(ComposerKeyboardStyleCopy.doneHint))
        }
        .padding(.horizontal, MeeshySpacing.xs)
        .frame(height: ComposerKeyboardStyleBar.height)
        .frame(maxWidth: .infinity)
        .background(Color.black.opacity(0.88))
        .environment(\.colorScheme, .dark)
        // La barre garde 44 pt : ses glyphes suivent Dynamic Type jusqu'à ce
        // qu'ils sortent de leur cible ; VoiceOver lit leurs noms.
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
    }

    private func familyButton(_ famille: ComposerKeyboardStyleFamily) -> some View {
        let ouverte = openFamily == famille
        return glyph(famille)
            .frame(width: 34, height: 34)
            .background(Circle().fill(ouverte ? MeeshyColors.brandPrimary : Color.clear))
            .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
            .contentShape(Rectangle())
            .onTapGesture { onFamily(famille, .tap) }
            .onLongPressGesture(minimumDuration: ComposerKeyboardStyleBar.optionsPress) {
                HapticFeedback.medium()
                onFamily(famille, .longPress)
            }
            .accessibilityElement()
            .accessibilityLabel(Text(famille.label))
            .accessibilityAddTraits(ouverte ? [.isButton, .isSelected] : .isButton)
            .accessibilityAction { onFamily(famille, .tap) }
            .accessibilityAction(named: Text(ComposerKeyboardStyleCopy.allOptions)) { onFamily(famille, .longPress) }
    }

    @ViewBuilder
    private func glyph(_ famille: ComposerKeyboardStyleFamily) -> some View {
        if let text {
            ComposerKeyboardFamilyGlyph(indicator: famille.indicator(of: text))
        } else {
            Image(systemName: famille.symbol)
                .font(MeeshyFont.relative(MeeshyIconSize.lg, weight: .semibold))
                .foregroundStyle(.white)
        }
    }
}

/// **Le glyphe d'une commande, peint depuis l'indicateur du SDK** : il montre
/// la valeur courante, jamais un pictogramme figé.
struct ComposerKeyboardFamilyGlyph: View {
    let indicator: StoryTextAttributeCycle.Indicator

    private static let glyphSize: CGFloat = 17

    var body: some View {
        switch indicator {
        case .styledGlyph(let lettres, let style):
            Text(lettres)
                .font(storyFont(for: style, size: Self.glyphSize))
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .foregroundStyle(.white)
        case .effectGlyph(let lettres, let effet):
            Text(lettres)
                .font(MeeshyFont.relative(Self.glyphSize, weight: .bold))
                .foregroundStyle(.white)
                .storyTextEffect(effet, fontSize: Self.glyphSize, textColor: .white)
        case .code(let code):
            Text(code)
                .font(MeeshyFont.relative(13, weight: .heavy))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .foregroundStyle(.white)
                .padding(.horizontal, 4)
                .frame(minWidth: 26, minHeight: 20)
                .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(Color.white.opacity(0.8), lineWidth: 1.2))
        case .colorDot(let hex):
            Circle()
                .fill(Self.color(hex) ?? .white)
                .overlay(Circle().strokeBorder(Color.white.opacity(0.7), lineWidth: 1))
                .frame(width: 20, height: 20)
        case .symbol("circle", _, let teinte):
            Circle()
                .strokeBorder(teinte.flatMap(Self.color) ?? Color.white.opacity(0.55), lineWidth: 3.5)
                .frame(width: 20, height: 20)
        case .symbol(let nom, _, let teinte):
            Image(systemName: nom)
                .font(MeeshyFont.relative(MeeshyIconSize.lg, weight: .semibold))
                .foregroundStyle(teinte.flatMap(Self.color) ?? .white)
        case .backgroundSwatch(let hex, let verre):
            RoundedRectangle(cornerRadius: 5)
                .fill(hex.flatMap(Self.color) ?? Color.white.opacity(verre ? 0.35 : 0))
                .overlay(RoundedRectangle(cornerRadius: 5)
                    .strokeBorder(Color.white.opacity(0.8), style: StrokeStyle(lineWidth: 1.2, dash: hex == nil && !verre ? [3, 2] : [])))
                .overlay(Text("A").font(MeeshyFont.relative(12, weight: .bold)).foregroundStyle(.white))
                .frame(width: 22, height: 20)
        }
    }

    private static func color(_ hex: String) -> Color? {
        HexColor(hex: hex).map { Color(uiColor: $0.uiColor) }
    }
}

// MARK: - Le panneau d'une famille

/// **Les choix d'une famille, à la place du clavier** — les rangées du SDK,
/// chacune sous son nom, et la palette unique.
struct ComposerKeyboardStylePanel: View {
    let family: ComposerKeyboardStyleFamily
    @Binding var textObject: StoryTextObject
    var profile: StoryTextEditProfile = .composer

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                ForEach(Array(family.panel(serving: profile.tools).enumerated()), id: \.offset) { _, section in
                    sectionView(section)
                }
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.md)
        }
        .scrollDismissesKeyboard(.never)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Color.black.opacity(0.92))
        .environment(\.colorScheme, .dark)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(family.label))
    }

    @ViewBuilder
    private func sectionView(_ section: ComposerKeyboardPanelSection) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xsPlus) {
            Text(section.title)
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                .foregroundStyle(.white.opacity(0.6))
                .accessibilityAddTraits(.isHeader)
            switch section {
            case .tool(let outil, let omis):
                TextEditToolOptions(tool: outil, textObject: $textObject, profile: profile, omitting: omis)
            case .palette(let cibles):
                ComposerSharedPalette(targets: cibles, textObject: $textObject)
            }
        }
    }

}
