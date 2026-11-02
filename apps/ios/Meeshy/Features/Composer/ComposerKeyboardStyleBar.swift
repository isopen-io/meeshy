import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Les quatre familles de la barre collée au clavier** (#13839, L4 — maquette
/// état 2 : « Une barre fine est collée au clavier : police,
/// couleur, alignement, fond du texte et OK »).
///
/// Elles remplacent la colonne de neuf glyphes sans retirer un réglage : les
/// huit `TextEditTool` du SDK s'y rangent une fois chacun, et chaque contrôle de
/// ces outils paraît dans exactement un panneau (`ComposerKeyboardStyleBarTests`).
/// L'énuméré du SDK n'est pas réordonné : l'ordre de ses `case` porte sa
/// sérialisation.
nonisolated enum ComposerKeyboardStyleFamily: String, CaseIterable, Equatable, Sendable {
    /// Aa — police, taille, graisse, effet, langue du texte.
    case typography
    /// ● — couleur, puis contour.
    case color
    /// ≡ — alignement.
    case alignment
    /// ▣ — fond, puis cadre.
    case surface

    var tools: [TextEditTool] {
        switch self {
        case .typography: return [.style, .effect, .language]
        case .color:      return [.color, .border]
        case .alignment:  return [.align]
        case .surface:    return [.background, .frame]
        }
    }

    /// Ce que le panneau de la famille peint, de haut en bas. La graisse vit
    /// avec la police (c'est de la typographie) ; chaque panneau n'a qu'une
    /// palette.
    var panel: [ComposerKeyboardPanelSection] {
        switch self {
        case .typography:
            return [.tool(.style, omitting: []), .tool(.align, omitting: [.alignment]),
                    .tool(.effect, omitting: []), .tool(.language, omitting: [])]
        case .color:
            return [.palette([.text, .border]), .tool(.border, omitting: [.borderPalette])]
        case .alignment:
            return [.tool(.align, omitting: [.weight])]
        case .surface:
            return [.tool(.background, omitting: []), .tool(.frame, omitting: [.frameBorderPalette]),
                    .palette([.frame])]
        }
    }

    var symbol: String {
        switch self {
        case .typography: return "textformat"
        case .color:      return "circle.fill"
        case .alignment:  return "text.alignleft"
        case .surface:    return "square.fill"
        }
    }

    @MainActor
    var label: String {
        switch self {
        case .typography:
            return String(localized: "composer.keyboard.family.typography",
                          defaultValue: "Police et effet", bundle: .main)
        case .color:
            return String(localized: "composer.keyboard.family.color",
                          defaultValue: "Couleur et contour", bundle: .main)
        case .alignment:
            return String(localized: "composer.keyboard.family.alignment",
                          defaultValue: "Alignement", bundle: .main)
        case .surface:
            return String(localized: "composer.keyboard.family.surface",
                          defaultValue: "Fond et cadre", bundle: .main)
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
        case .tool(let outil, _):
            return outil.accessibilityLabel
        case .palette(let cibles) where cibles == [.frame]:
            return ComposerKeyboardStyleCopy.frameColor
        case .palette:
            return TextEditTool.color.accessibilityLabel
        }
    }
}

nonisolated enum ComposerKeyboardStyleBar {
    /// Une cible de 44 pt : la barre ne grandit pas avec Dynamic Type — ses
    /// glyphes se lisent par VoiceOver.
    static let height: CGFloat = 44
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

    /// La palette du ▣ colore le liseré du cadre : sous les formes du cadre,
    /// un second « Cadre » ne dirait pas ce qu'elle règle.
    @MainActor
    static var frameColor: String {
        String(localized: "composer.keyboard.frameColor", defaultValue: "Couleur du cadre", bundle: .main)
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

/// **Aa · ● · ≡ · ▣ · OK**, collée au clavier du champ en place.
struct ComposerKeyboardStyleBarView: View {
    let openFamily: ComposerKeyboardStyleFamily?
    let onFamily: (ComposerKeyboardStyleFamily) -> Void
    let onDone: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            ForEach(ComposerKeyboardStyleFamily.allCases, id: \.self) { famille in
                familyButton(famille)
            }
            Spacer(minLength: MeeshySpacing.sm)
            Button(action: onDone) {
                Text(ComposerKeyboardStyleCopy.done)
                    .font(MeeshyFont.relative(MeeshyFont.calloutSize, weight: .bold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .foregroundStyle(.white)
                    .padding(.horizontal, MeeshySpacing.lg)
                    .frame(height: 32)
                    .background(Capsule().fill(MeeshyColors.brandPrimary))
                    .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint(Text(ComposerKeyboardStyleCopy.doneHint))
        }
        .padding(.horizontal, MeeshySpacing.sm)
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
        return Button { onFamily(famille) } label: {
            Image(systemName: famille.symbol)
                .font(MeeshyFont.relative(MeeshyIconSize.lg, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 36, height: 36)
                .background(Circle().fill(ouverte ? MeeshyColors.brandPrimary : Color.clear))
                .frame(width: MeeshyControlSize.tapTarget + 8, height: MeeshyControlSize.tapTarget)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(famille.label))
        .accessibilityAddTraits(ouverte ? [.isButton, .isSelected] : .isButton)
    }
}

// MARK: - Le panneau d'une famille

/// **Les choix d'une famille, à la place du clavier** — les rangées du SDK,
/// chacune sous son nom, et la palette unique.
struct ComposerKeyboardStylePanel: View {
    let family: ComposerKeyboardStyleFamily
    @Binding var textObject: StoryTextObject

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                ForEach(Array(family.panel.enumerated()), id: \.offset) { _, section in
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
                TextEditToolOptions(tool: outil, textObject: $textObject, omitting: omis)
            case .palette(let cibles):
                ComposerSharedPalette(targets: cibles, textObject: $textObject)
            }
        }
    }

}
