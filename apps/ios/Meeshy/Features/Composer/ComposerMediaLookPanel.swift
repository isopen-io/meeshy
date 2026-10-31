import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Filtres · Effets · Cadres de l'appel, en place sur un média (#13840)

/// **La section « Filtres et cadres » de l'édition en place d'un média.**
///
/// Les mêmes familles, les mêmes cases et les mêmes mots que la bande du viseur
/// et de la retouche (`ComposerLookStripRule`, `ComposerCaptureCopy`) ; mais le
/// choix écrit un RÉGLAGE de l'objet (`StoryMediaObject.look`) par le
/// `StoryComposerViewModel` — même id, même fichier, annulable, relu à la
/// réouverture —, au lieu de cuire un fichier neuf au « Terminé ».
struct ComposerMediaLookPanel: View {
    @ObservedObject var viewModel: StoryComposerViewModel
    let mediaId: String
    @State private var family: ComposerLookFamily = .filters

    /// **Choisir une case garde le reste du look** : filtre, effet et cadre se
    /// combinent, et le cadrage posé au viseur n'est jamais perdu.
    static func choosing(_ item: ComposerLookStripItem, in current: StoryMediaLook) -> StoryMediaLook {
        let regard = ComposerLookStripRule.look(of: item, combinedWith: ComposerMediaLookMapping.photoLook(current))
        return ComposerMediaLookMapping.storyLook(regard, framing: ComposerMediaLookMapping.framing(current))
    }

    var body: some View {
        let courant = StoryMediaLookEditing.look(ofMedia: mediaId, in: viewModel)
        let regard = ComposerMediaLookMapping.photoLook(courant)
        VStack(alignment: .leading, spacing: MeeshySpacing.smPlus) {
            familyPicker
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: MeeshySpacing.smPlus) {
                    ForEach(ComposerLookStripRule.items(family), id: \.self) { item in
                        cell(item, chosen: ComposerLookStripRule.isChosen(item, in: regard), current: courant)
                    }
                }
            }
        }
        .onAppear { ComposerLookPainterAdapter.shared.refreshAuthor() }
    }

    private var familyPicker: some View {
        HStack(spacing: MeeshySpacing.smPlus) {
            ForEach(ComposerLookFamily.allCases, id: \.self) { famille in
                let actif = famille == family
                Button {
                    family = famille
                    HapticFeedback.light()
                } label: {
                    Label(ComposerCaptureCopy.familyName(famille), systemImage: ComposerCaptureCopy.familySymbol(famille))
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                        .foregroundStyle(actif ? Color.white : Color.white.opacity(0.85))
                        .padding(.horizontal, MeeshySpacing.mdPlus)
                        .frame(minHeight: 44)
                        .background { pill(actif) }
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(actif ? [.isButton, .isSelected] : .isButton)
            }
        }
    }

    private func cell(_ item: ComposerLookStripItem, chosen: Bool, current: StoryMediaLook) -> some View {
        Button {
            StoryMediaLookEditing.apply(Self.choosing(item, in: current), toMedia: mediaId, in: viewModel)
            HapticFeedback.light()
        } label: {
            Label(ComposerCaptureCopy.itemName(item), systemImage: ComposerCaptureCopy.itemSymbol(item))
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                .foregroundStyle(chosen ? Color.white : Color.white.opacity(0.85))
                .lineLimit(1)
                .padding(.horizontal, MeeshySpacing.mdPlus)
                .frame(minHeight: 44)
                .background { pill(chosen) }
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(ComposerCaptureCopy.itemName(item))
        .accessibilityAddTraits(chosen ? [.isButton, .isSelected] : .isButton)
    }

    @ViewBuilder
    private func pill(_ on: Bool) -> some View {
        if on {
            Capsule().fill(MeeshyColors.brandGradient)
        } else {
            Capsule().fill(Color.white.opacity(0.12))
        }
    }
}
