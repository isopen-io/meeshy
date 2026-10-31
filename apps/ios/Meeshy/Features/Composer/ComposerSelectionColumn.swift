import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le rail d'édition, à la place du rail des outils** (#13957, #13974, spec
/// R6, décisions du porteur).
///
/// La colonne des six outils cède sa place, au même endroit, au niveau du HAUT
/// de la pile d'édition (`ComposerEditRailStack`) : d'abord Modifier ·
/// Dupliquer · Temps, puis Retirer en rouge, à l'écart ; puis, posés
/// par-dessus, les sous-outils de l'option touchée, ‹ Retour en tête. Chaque
/// entrée a son glyphe ET son mot. Il n'y a aucune barre en plus : la barre
/// posée au-dessus de Public et Publier (L5) est partie avec eux. Aucune action
/// « Ordre » : toucher un objet le fait passer devant (#13918). Rien n'y est
/// décidé : les entrées arrivent composées par `ComposerEditRailItems`.
struct ComposerSelectionColumn: View {
    let level: ComposerEditRailLevel
    let items: [ComposerEditRailItem]
    /// Le sous-outil dont les propriétés sont ouvertes en bas, surligné.
    var openSection: ComposerObjectEditorSection?
    /// Les autres entrées allumées : l'entrée de N1 ouverte, le réglage dont le
    /// curseur est ouvert, Muet quand le son est coupé.
    var lit: Set<ComposerEditRailItem> = []
    let onItem: (ComposerEditRailItem) -> Void

    func isOn(_ item: ComposerEditRailItem) -> Bool {
        ComposerEditRailItems.isOn(item, openSection: openSection) || lit.contains(item)
    }

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    static let itemWidth: CGFloat = 72

    var body: some View {
        ViewThatFits(in: .vertical) {
            entries
            ScrollView(.vertical, showsIndicators: false) { entries }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(ComposerEditRailCopy.railLabel(level)))
        .accessibilityIdentifier("composer.selection.column")
    }

    private var entries: some View {
        VStack(spacing: MeeshySpacing.sm) {
            ForEach(items.filter { !$0.isDestructive }, id: \.self) { item in entry(item) }
            if let retirer = items.first(where: \.isDestructive) {
                entry(retirer).padding(.top, MeeshySpacing.sm)
            }
        }
    }

    private func entry(_ item: ComposerEditRailItem) -> some View {
        let ouverte = isOn(item)
        let teinte = ComposerSelectionPaint.tint(item)
        return Button { onItem(item) } label: {
            VStack(spacing: 2) {
                ComposerSceneRoundGlyph(symbol: ComposerEditRailCopy.symbol(item), tint: teinte, isOn: ouverte)
                if !dynamicTypeSize.isAccessibilitySize {
                    Text(ComposerEditRailCopy.label(item))
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(teinte)
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                        .minimumScaleFactor(0.8)
                        .shadow(color: .black.opacity(0.55), radius: 2, y: 1)
                }
            }
            .frame(width: Self.itemWidth)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(ComposerEditRailCopy.label(item)))
        .accessibilityAddTraits(ouverte ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier("composer.selection.\(item.identifier)")
    }
}

/// Ce que le rail PEINT : l'encre blanche du chrome, le rouge sémantique pour
/// la seule action qui détruit.
nonisolated enum ComposerSelectionPaint {
    static func tint(_ action: ComposerSelectionAction) -> Color {
        action.isDestructive ? MeeshyColors.error : ComposerFloatingRailInk.rest
    }

    static func tint(_ item: ComposerEditRailItem) -> Color {
        item.isDestructive ? MeeshyColors.error : ComposerFloatingRailInk.rest
    }
}

/// Les mots et les glyphes du rail d'édition — ceux de la barre de L5 et des
/// puces des feuilles, qu'il remplace : aucun mot neuf.
@MainActor
enum ComposerEditRailCopy {

    static func label(_ item: ComposerEditRailItem) -> String {
        switch item {
        case .action(let action):   return ComposerSelectionCopy.label(action)
        case .background(let action): return ComposerEditTreeCopy.label(action)
        case .back:                 return back
        case .section(let section): return ComposerObjectEditorCopy.entry(section)
        case .extra(let extra):     return ComposerSelectionCopy.label(extra)
        case .keyframes:            return ComposerSelectionCopy.keyframes
        // Les deux clés de l'arbre vivent au catalogue de MeeshyUI, celui des
        // actions de la scène qui disent les mêmes mots.
        case .backgroundEntry(.setAsBackground):   return ComposerSelectionCopy.label(.setAsBackground)
        case .backgroundEntry(.replaceBackground): return ComposerSelectionCopy.label(.replaceBackground)
        case .backgroundEntry(let entree):
            return ComposerBackgroundModify.entry(entree).map(ComposerEditTreeCopy.label) ?? entree.rawValue
        case .adjustment(let kind): return ComposerAdjustCopy.label(kind)
        case .mute:                 return ComposerObjectEditorCopy.mute
        }
    }

    static func symbol(_ item: ComposerEditRailItem) -> String {
        switch item {
        case .action(let action):   return action.symbol
        case .background(let action): return ComposerEditTreeCopy.symbol(action)
        case .back:                 return "chevron.backward"
        case .section(let section): return ComposerObjectEditorRail.symbolName(section)
        case .extra(let extra):     return extra.symbol
        case .keyframes:            return "diamond"
        case .backgroundEntry(let entree): return ComposerBackgroundModify.entry(entree)?.sfSymbol ?? "questionmark"
        case .adjustment(let kind): return kind.icon
        case .mute:                 return "speaker.slash"
        }
    }

    /// Le niveau, dit à VoiceOver : « Actions de l'élément », puis le nom de
    /// l'option dont les sous-outils sont posés.
    static func railLabel(_ level: ComposerEditRailLevel) -> String {
        switch level {
        case .actions:          return ComposerSelectionCopy.bar
        case .background:       return ComposerEditTreeCopy.backgroundTitle
        case .options(.modify): return ComposerSelectionCopy.label(.modify)
        case .options(.time):   return ComposerSelectionCopy.label(.time)
        case .backgroundAdjust(.tone):   return ComposerAdjustCopy.title
        case .backgroundAdjust(.effect): return ComposerAdjustCopy.effectsTitle
        case .backgroundSound:
            return ComposerBackgroundModify.entry(.sound).map(ComposerEditTreeCopy.label) ?? ""
        }
    }

    static var back: String {
        String(localized: "common.back", defaultValue: "Retour", bundle: .main)
    }
}

/// **L'en-tête de la feuille basse** : le nom du réglage ouvert, et OK qui
/// referme le niveau — la feuille, jamais l'édition.
struct ComposerPropertiesHeader: View {
    let title: String
    let onDone: () -> Void

    var body: some View {
        HStack {
            Text(title)
                .font(.headline)
                .foregroundStyle(MeeshyColors.textPrimary(isDark: true))
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: MeeshySpacing.sm)
            Button(ComposerAnchoredSheetCopy.ok, action: onDone)
                .font(.body.weight(.semibold))
                .foregroundStyle(MeeshyColors.brandPrimary)
                .frame(minWidth: 44, minHeight: 44)
                .keyboardShortcut(.defaultAction)
                .accessibilityIdentifier("composer.selection.sheet.done")
        }
        .environment(\.colorScheme, .dark)
    }
}
