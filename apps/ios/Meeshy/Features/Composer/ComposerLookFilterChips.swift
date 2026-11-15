import SwiftUI
import MeeshyUI

/// Les mots du tri de la bande (#17267).
enum ComposerLookFilterCopy {
    static var none: String {
        String(localized: "composer.look.none", defaultValue: "Aucun", table: "ComposerCamera", bundle: .main)
    }

    static var chipsLabel: String {
        String(localized: "composer.look.chips.label", defaultValue: "Trier les looks",
               table: "ComposerCamera", bundle: .main)
    }

    static func typeName(_ type: ComposerLookTypeChip) -> String {
        switch type {
        case .all:
            return String(localized: "composer.look.type.all", defaultValue: "Tout", table: "ComposerCamera", bundle: .main)
        case .filters:
            return String(localized: "composer.look.type.filters", defaultValue: "Filtres",
                          table: "ComposerCamera", bundle: .main)
        case .frames:
            return String(localized: "composer.look.type.frames", defaultValue: "Cadres",
                          table: "ComposerCamera", bundle: .main)
        case .imageEffects:
            return String(localized: "composer.look.type.imageEffects", defaultValue: "Effets image",
                          table: "ComposerCamera", bundle: .main)
        case .faceEffects:
            return String(localized: "composer.look.type.faceEffects", defaultValue: "Effets visage",
                          table: "ComposerCamera", bundle: .main)
        }
    }
}

/// **Les puces sous la bande** (#17267, porteur : « juste en bas mettre
/// les chips permettant de les filtrer ») : les types, puis les ambiances qu'au
/// moins une case porte sous le type choisi. Chaque toucher trie la bande dans
/// la même image. La puce est celle des cadres de l'appel (`CallFrameMoodChip`) :
/// même verre, même enfoncement, même cible de 44 pt.
struct ComposerLookFilterChips: View {
    let filter: ComposerLookStripFilter
    let onChange: (ComposerLookStripFilter) -> Void

    static var height: CGFloat { ComposerLookStripRule.chipsHeight }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            AdaptiveGlassContainer(spacing: CallFrameMoodChips.spacing) {
                HStack(spacing: CallFrameMoodChips.spacing) {
                    ForEach(ComposerLookTypeChip.allCases, id: \.self) { type in
                        CallFrameMoodChip(title: ComposerLookFilterCopy.typeName(type), isSelected: filter.type == type) {
                            guard filter.type != type else { return }
                            HapticFeedback.light()
                            onChange(filter.selecting(type: type))
                        }
                    }
                    ForEach(ComposerLookStripFilterRule.moods(for: filter.type), id: \.self) { mood in
                        CallFrameMoodChip(title: CallFrameCopy.moodName(mood), isSelected: filter.mood == mood) {
                            HapticFeedback.light()
                            onChange(filter.toggling(mood: mood))
                        }
                    }
                }
                .padding(.horizontal, MeeshySpacing.mdPlus)
            }
        }
        .frame(height: Self.height)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(ComposerLookFilterCopy.chipsLabel)
    }
}
