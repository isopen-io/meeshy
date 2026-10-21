import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Placement

/// **Le PLACEMENT, en bas** — c'est lui qui remplace le choix de la porte.
///
/// Avant #4657, « Vocal » et « Ajouter un son » différaient par leur
/// DESTINATION, et l'auteur devait la deviner au bouton qu'il pressait.
/// Elle se choisit désormais, à l'endroit où l'on décide de publier.
struct AudioPostPlacementSection: View {
    let placement: Binding<ComposerAudioRole>
    /// Le son est emprunté à la bibliothèque (`borrowedSound != nil` chez l'hôte).
    let isBorrowed: Bool
    let foregroundDestination: ComposerSoundDestination

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xsPlus) {
            // **Sans titre** (directive porteur 2026-09-01). « Place du
            // son » nommait ce que les deux libellés disent déjà — « fond
            // de publication », « contenu de publication » se lisent seuls.
            // Un en-tête qui répète son contenu vole une ligne au rognage.
            HStack(spacing: 0) {
                ForEach(ComposerAudioRole.allCases, id: \.self) { role in
                    placementHalf(role, binding: placement)
                }
            }
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .fill(theme.surface(tint: "C7D2FE"))
            )
            .overlay(
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .stroke(MeeshyColors.indigo400.opacity(MeeshyOpacity.medium), lineWidth: 1)
            )

            // La définition passe SOUS l'interrupteur, sur une ligne, pour
            // celle qui est choisie — c'est ce qui divise sa hauteur par
            // deux. Le prix est réel et assumé : il faut choisir une moitié
            // pour lire ce qu'elle fait. Les deux libellés étant explicites,
            // la ligne CONFIRME plutôt qu'elle n'enseigne.
            Text(isBorrowed
                 ? ComposerSoundRoleCopy.borrowedForegroundRefusal
                 : ComposerSoundRoleCopy.description(placement.wrappedValue,
                                                   destination: foregroundDestination))
                .font(.caption2)
                .foregroundColor(theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// Une moitié de l'interrupteur — son libellé, et rien d'autre.
    ///
    /// La description a quitté chaque moitié pour la ligne unique sous
    /// l'interrupteur : deux titres et deux sous-titres empilés faisaient un
    /// bloc de 88 pt là où la décision en mérite 44.
    @ViewBuilder
    private func placementHalf(_ role: ComposerAudioRole,
                               binding: Binding<ComposerAudioRole>) -> some View {
        let choisi = binding.wrappedValue == role
        // Le premier plan fait du son une pièce jointe, c'est-à-dire un FICHIER
        // de la publication : un son de la bibliothèque devrait être ré-uploadé
        // pour en devenir une, donc détaché de son `soundId` et du crédit de son
        // auteur. La moitié reste MONTRÉE et désactivée — une option absente se
        // lit comme une capacité qui n'existe pas.
        let refuse = (role == .foreground && isBorrowed)

        Button {
            guard !refuse else { return }
            binding.wrappedValue = role
            HapticFeedback.light()
        } label: {
            Text(ComposerSoundRoleCopy.label(role, destination: foregroundDestination))
                .font(.footnote.weight(.semibold))
                .foregroundColor(choisi ? .white : theme.textPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .frame(maxWidth: .infinity)
                .padding(.vertical, MeeshySpacing.smPlus)
                .padding(.horizontal, MeeshySpacing.sm)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.md)
                        .fill(choisi ? AnyShapeStyle(MeeshyColors.brandGradient) : AnyShapeStyle(Color.clear))
                )
                .contentShape(RoundedRectangle(cornerRadius: MeeshyRadius.md))
        }
        .buttonStyle(.plain)
        .disabled(refuse)
        .opacity(refuse ? 0.4 : 1)
        // **La MÊME destination que ce que l'œil lit** (#4722) : de deux chaînes
        // pour un bouton, celle qu'on n'entend pas est celle que nul ne corrige.
        .accessibilityLabel(ComposerSoundRoleCopy.label(role, destination: foregroundDestination))
        .accessibilityHint(refuse
                           ? ComposerSoundRoleCopy.borrowedForegroundRefusal
                           : ComposerSoundRoleCopy.description(role, destination: foregroundDestination))
        .accessibilityAddTraits(choisi ? [.isSelected] : [])
    }
}
