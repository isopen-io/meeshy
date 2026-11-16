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
            return [.tool(.frame, omitting: [.frameBorderWidth, .frameBorderPalette])]
        case .frameStyle:
            return [.tool(.background, omitting: []),
                    .tool(.frame, omitting: [.frameShapes, .framePadding, .frameBorderPalette]),
                    .palette([.frame])]
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

    /// **La couleur que la commande montre** : le cercle plein porte celle du
    /// texte, le cercle creux celle du contour — et rien tant qu'il n'y a pas
    /// de contour. Les autres commandes restent neutres.
    func tint(of text: StoryTextObject) -> String? {
        switch self {
        case .color:
            return text.textColor ?? "FFFFFF"
        case .outline:
            guard (text.borderWidth ?? 0) > 0 else { return nil }
            return text.borderColor ?? "FFFFFF"
        case .typography, .effect, .language, .frame, .frameStyle:
            return nil
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

    /// Le cercle plein se peint de la couleur du texte, le cercle creux de
    /// celle du contour ; les autres commandes gardent leur glyphe.
    @ViewBuilder
    private func glyph(_ famille: ComposerKeyboardStyleFamily) -> some View {
        let teinte = text.flatMap { famille.tint(of: $0) }.flatMap(HexColor.init(hex:)).map { Color(uiColor: $0.uiColor) }
        switch famille {
        case .color:
            Circle()
                .fill(teinte ?? .white)
                .overlay(Circle().strokeBorder(Color.white.opacity(0.7), lineWidth: 1))
                .frame(width: 20, height: 20)
        case .outline:
            Circle()
                .strokeBorder(teinte ?? Color.white.opacity(0.55), lineWidth: 3.5)
                .frame(width: 20, height: 20)
        case .typography, .effect, .language, .frame, .frameStyle:
            Image(systemName: famille.symbol)
                .font(MeeshyFont.relative(MeeshyIconSize.lg, weight: .semibold))
                .foregroundStyle(.white)
        }
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
